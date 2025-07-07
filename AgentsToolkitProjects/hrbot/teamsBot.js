const { ActivityTypes, CardFactory } = require("@microsoft/agents-activity");
const {
  AgentApplication,
  AttachmentDownloader,
  MemoryStorage,
} = require("@microsoft/agents-hosting");
const { version } = require("@microsoft/agents-hosting/package.json");
const axios = require("axios");

const downloader = new AttachmentDownloader();
const storage = new MemoryStorage();

const teamsBot = new AgentApplication({
  storage,
  fileDownloaders: [downloader],
});

// --- Basic Commands ---
teamsBot.message("/reset", async (context, state) => {
  state.deleteConversationState();
  await context.sendActivity("✅ Conversation state has been reset.");
});

teamsBot.message("/count", async (context, state) => {
  const count = state.conversation.count ?? 0;
  await context.sendActivity(`The count is ${count}`);
});

teamsBot.message("/diag", async (context, state) => {
  await state.load(context, storage);
  await context.sendActivity(JSON.stringify(context.activity));
});

teamsBot.message("/state", async (context, state) => {
  await state.load(context, storage);
  await context.sendActivity(JSON.stringify(state));
});

teamsBot.message("/runtime", async (context, state) => {
  const runtime = {
    nodeversion: process.version,
    sdkversion: version,
  };
  await context.sendActivity(JSON.stringify(runtime));
});

// --- Main Feature: /search_candidates ---
teamsBot.message(/^\/search_candidates\s+(.*)/i, async (context, state) => {
  const query = context.activity.text.replace(/^\/search_candidates\s+/i, "").trim();

  if (!query) {
    await context.sendActivity("❗ Please provide a query after `/search_candidates`.");
    return;
  }

  try {
    const response = await axios.post("http://104.208.162.61:8083/search_candidates", {
      query
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000
    });

    const result = response.data;

    if (!result || !result.results || result.results.length === 0) {
      await context.sendActivity("⚠️ No candidates found.");
      return;
    }

    const topResults = result.results.slice(0, 20);

    for (const r of topResults) {
      const rawText = r.text || "";
      let name = "Unknown";
      let summary = "(No summary provided)";
      let empId = r.filename.replace(".txt", "");

      try {
        const nameMatch = rawText.match(/name\s*=\s*([^,}]+)/i);
        if (nameMatch) name = nameMatch[1].trim();

        const summaryMatch = rawText.match(/summary\s*=\s*([^,}]+)/i);
        if (summaryMatch) summary = summaryMatch[1].trim();

        const idMatch = rawText.match(/employee_id\s*=\s*([^,}]+)/i);
        if (idMatch) empId = idMatch[1].trim();
      } catch (err) {
        // fallback already applied
      }

      const card = {
        type: "AdaptiveCard",
        version: "1.4",
        body: [
          {
            type: "TextBlock",
            size: "Large",
            weight: "Bolder",
            text: `👤 ${name}`
          },
          {
            type: "TextBlock",
            text: `🆔 Employee ID: ${empId}`,
            wrap: true
          },
          {
            type: "TextBlock",
            text: `📊 Score: ${r.score?.toFixed(4) ?? "N/A"}`,
            wrap: true
          },
          {
            type: "TextBlock",
            text: `📝 Summary:\n${summary}`,
            wrap: true
          }
        ],
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json"
      };

      await context.sendActivity({
        type: "message",
        attachments: [
          {
            contentType: "application/vnd.microsoft.card.adaptive",
            content: card
          }
        ]
      });
    }

  } catch (error) {
    const errMsg = error.response?.data || error.message;
    await context.sendActivity(`❌ Search Candidates Error:\n\`\`\`${errMsg}\`\`\``);
  }
});

// --- Greeting ---
teamsBot.conversationUpdate("membersAdded", async (context, state) => {
  await context.sendActivity(
    `👋 Hello! I’m your resume assistant bot running on SDK v${version}.\nTry \`/search_candidates python and nlp\`.`
  );
});

// --- Default Echo with Count ---
teamsBot.activity(ActivityTypes.Message, async (context, state) => {
  let count = state.conversation.count ?? 0;
  state.conversation.count = ++count;
  await context.sendActivity(`[${count}] You said: ${context.activity.text}`);
});

// --- Optional Regex Match Example ---
teamsBot.activity(/^message/, async (context, state) => {
  await context.sendActivity(`Matched with regex: ${context.activity.type}`);
});

// --- Optional Custom Function Match ---
teamsBot.activity(
  async (context) => Promise.resolve(context.activity.type === "message"),
  async (context, state) => {
    await context.sendActivity(`Matched function: ${context.activity.type}`);
  }
);

module.exports.teamsBot = teamsBot;
