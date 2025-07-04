const { ActivityTypes } = require("@microsoft/agents-activity");
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

// /reset
teamsBot.message("/reset", async (context, state) => {
  state.deleteConversationState();
  await context.sendActivity("✅ Conversation state has been reset.");
});

// /count
teamsBot.message("/count", async (context, state) => {
  const count = state.conversation.count ?? 0;
  await context.sendActivity(`The count is ${count}`);
});

// /diag
teamsBot.message("/diag", async (context, state) => {
  await state.load(context, storage);
  await context.sendActivity(JSON.stringify(context.activity));
});

// /state
teamsBot.message("/state", async (context, state) => {
  await state.load(context, storage);
  await context.sendActivity(JSON.stringify(state));
});

// /runtime
teamsBot.message("/runtime", async (context, state) => {
  const runtime = {
    nodeversion: process.version,
    sdkversion: version,
  };
  await context.sendActivity(JSON.stringify(runtime));
});

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

    // Limit to top 20 results
    const topResults = result.results.slice(0, 20);

    const formattedResults = topResults.map((r, index) => {
      const employeeId = r.filename.replace(".txt", "");

      // Extract name using regex from r.text
      let name = "Unknown";
      const nameMatch = r.text.match(/name=([^,}]+)/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].trim();
      }

      const textSnippet = r.text.split(/\s+/).slice(0, 10).join(" ") + " ...";

      // Extract social_profiles if any (try-catch fallback)
      let parsedText = {};
      try {
        parsedText = JSON.parse(
          r.text
            .replace(/([{\[,])\s*([a-zA-Z0-9_]+)\s*=/g, '$1 "$2":') // quote keys
            .replace(/=\s*([^,\]}]+)/g, ': "$1"')                  // convert = to :
        );
      } catch {
        parsedText = {};
      }

      const profiles = Array.isArray(parsedText.social_profiles)
        ? parsedText.social_profiles.map(p => `🔗 [${p.platform}](${p.link})`).join(" | ")
        : "";

      return (
        `🧑 *${name}*\n` +
        `📄 *Employee ID:* \`${employeeId}\`\n` +
        `- **Keyword Score:** ${r.keywordScore ?? "N/A"}\n` +
        `- **Vector Score:** ${r.vectorScore ?? "N/A"}\n` +
        `- **Hybrid Score:** ${r.hybridScore ?? "N/A"}\n` +
        `- **Summary Snippet:** \`${textSnippet}\`\n` +
        (profiles ? `- **Profiles:** ${profiles}` : "")
      );
    });

    // Chunk messages to stay within Teams limits
    const messageChunks = [];
    let currentChunk = "";
    for (const entry of formattedResults) {
      if ((currentChunk + "\n\n" + entry).length > 3800) {
        messageChunks.push(currentChunk);
        currentChunk = entry;
      } else {
        currentChunk += `\n\n${entry}`;
      }
    }
    if (currentChunk) messageChunks.push(currentChunk);

    for (const chunk of messageChunks) {
      await context.sendActivity(chunk);
    }

  } catch (error) {
    const errMsg = error.response?.data || error.message;
    await context.sendActivity(`❌ Search Candidates Error:\n\`\`\`${errMsg}\`\`\``);
  }
});







// Greeting on member join
teamsBot.conversationUpdate("membersAdded", async (context, state) => {
  await context.sendActivity(
    `👋 Hello! I’m your resume assistant bot running on SDK v${version}.\nTry \`/vector_search your query\` or \`/keyword_search your query\`.`
  );
});

// Default message echo with counter
teamsBot.activity(ActivityTypes.Message, async (context, state) => {
  let count = state.conversation.count ?? 0;
  state.conversation.count = ++count;
  await context.sendActivity(`[${count}] You said: ${context.activity.text}`);
});

// Optional regex handler
teamsBot.activity(/^message/, async (context, state) => {
  await context.sendActivity(`Matched with regex: ${context.activity.type}`);
});

// Optional function handler
teamsBot.activity(
  async (context) => Promise.resolve(context.activity.type === "message"),
  async (context, state) => {
    await context.sendActivity(`Matched function: ${context.activity.type}`);
  }
);

module.exports.teamsBot = teamsBot;
