const { sendMessage } = require("../handles/sendMessage");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const activeSessions = new Map();

module.exports = {
  config: {
    name: "gagstock",
    aliases: ["growstock", "gardenstock"],
    version: "1.0.0",
    author: "ALEX",
    countDown: 5,
    role: 0,
    shortDescription: "Track Grow A Garden stock and weather",
    longDescription: "Tracks Grow A Garden gear, seeds, eggs, weather every 30 seconds, and honeyStock every 1 minute. Notifies only when data updates. Use 'on' to start, 'off' to stop.",
    category: "Tools ⚒️",
    guide: "{prefix}gagstock <on|off>\n\n" +
           "Options:\n" +
           "   on: Start tracking stock and weather\n" +
           "   off: Stop tracking\n\n" +
           "Example:\n" +
           "   {prefix}gagstock on\n" +
           "   {prefix}gagstock off"
  },

  languages: {
    en: {
      success: "✅ %1",
      error: "❌ Error: %1",
      invalidOption: "⚠️ Invalid option '%1'. Use 'on' or 'off'.",
      missingValue: "📌 Missing action. Use '{prefix}gagstock on' or '{prefix}gagstock off'.",
      example: "📌 Example usage: %1",
      alreadyTracking: "📡 You're already tracking Gagstock. Use '{prefix}gagstock off' to stop.",
      noActiveSession: "⚠️ You don't have an active gagstock session.",
      stopped: "🛑 Gagstock tracking stopped."
    },
    vi: {
      success: "✅ %1",
      error: "❌ Lỗi: %1",
      invalidOption: "⚠️ Tùy chọn không hợp lệ '%1'. Sử dụng 'on' hoặc 'off'.",
      missingValue: "📌 Thiếu hành động. Sử dụng '{prefix}gagstock on' hoặc '{prefix}gagstock off'.",
      example: "📌 Ví dụ sử dụng: %1",
      alreadyTracking: "📡 Bạn đang theo dõi Gagstock. Sử dụng '{prefix}gagstock off' để dừng.",
      noActiveSession: "⚠️ Bạn không có phiên theo dõi gagstock đang hoạt động.",
      stopped: "🛑 Đã dừng theo dõi Gagstock."
    }
  },

  onLoad: async function ({ configPath }) {
    const dataPath = path.join(configPath, "commands", "gagstock");
    try {
      if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
        console.log(`Created gagstock data folder at ${dataPath}`);
      }
    } catch (error) {
      console.error(`Failed to create gagstock data folder: ${error.message}`);
    }
  },

  execute: async function ({ api, event, args, getLang, prefix }) {
    const { threadID, messageID, senderID } = event;
    const action = args[0]?.toLowerCase();

    try {
      if (!action) {
        return api.sendMessage(
          getLang("missingValue") + "\n" + getLang("example", `${prefix}gagstock on`),
          threadID,
          messageID
        );
      }

      if (action === "off") {
        const session = activeSessions.get(senderID);
        if (session) {
          clearInterval(session.interval);
          activeSessions.delete(senderID);
          return api.sendMessage(getLang("stopped"), threadID, messageID);
        } else {
          return api.sendMessage(getLang("noActiveSession"), threadID, messageID);
        }
      }

      if (action !== "on") {
        return api.sendMessage(
          getLang("invalidOption", action) + "\n" + getLang("example", `${prefix}gagstock on`),
          threadID,
          messageID
        );
      }

      if (activeSessions.has(senderID)) {
        return api.sendMessage(getLang("alreadyTracking"), threadID, messageID);
      }

      await api.sendMessage(
        getLang("success", "Gagstock tracking started! You'll be notified when stock or weather changes."),
        threadID,
        messageID
      );

      const getPHTime = (timestamp) =>
        new Date(timestamp).toLocaleString("en-PH", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          weekday: "short"
        });

      const sessionData = {
        interval: null,
        lastCombinedKey: null,
        lastMessage: ""
      };

      const fetchAll = async () => {
        try {
          const [gearSeedRes, eggRes, weatherRes, honeyStockRes] = await Promise.all([
            axios.get("https://growagardenstock.com/api/stock?type=gear-seeds"),
            axios.get("https://growagardenstock.com/api/stock?type=egg"),
            axios.get("https://growagardenstock.com/api/stock/weather"),
            axios.get("http://65.108.103.151:22377/api/stocks?type=honeyStock")
          ]);

          const gearSeed = gearSeedRes.data;
          const egg = eggRes.data;
          const weather = weatherRes.data;
          const honey = honeyStockRes.data;

          const combinedKey = JSON.stringify({
            gear: gearSeed.gear,
            seeds: gearSeed.seeds,
            egg: egg.egg,
            weather: weather.updatedAt,
            honey: honey.updatedAt,
            honeyList: honey.honeyStock
          });

          if (combinedKey === sessionData.lastCombinedKey) return;
          sessionData.lastCombinedKey = combinedKey;

          const now = Date.now();

          const gearTime = getPHTime(gearSeed.updatedAt);
          const gearReset = Math.max(300 - Math.floor((now - gearSeed.updatedAt) / 1000), 0);
          const gearResetText = `${Math.floor(gearReset / 60)}m ${gearReset % 60}s`;

          const eggTime = getPHTime(egg.updatedAt);
          const eggReset = Math.max(600 - Math.floor((now - egg.updatedAt) / 1000), 0);
          const eggResetText = `${Math.floor(eggReset / 60)}m ${eggReset % 60}s`;

          const weatherIcon = weather.icon || "🌦️";
          const weatherDesc = weather.currentWeather || "Unknown";
          const weatherBonus = weather.cropBonuses || "N/A";

          const honeyStocks = honey.honeyStock || [];
          const honeyText = honeyStocks.length
            ? honeyStocks.map((h) => `🍯 ${h.name}: ${h.value}`).join("\n")
            : "No honey stock available.";

          const message = `🌾 𝗚𝗿𝗼𝘄 𝗔 𝗚𝗮𝗿𝗱𝗲𝗻 — 𝗡𝗲𝘄 𝗦𝘁𝗼𝗰𝗸 & 𝗪𝗲𝗮𝘁𝗵𝗲𝗿\n\n` +
            `🛠️ 𝗚𝗲𝗮𝗿:\n${gearSeed.gear?.join("\n") || "No gear."}\n\n` +
            `🌱 𝗦𝗲𝗲𝗱𝘀:\n${gearSeed.seeds?.join("\n") || "No seeds."}\n\n` +
            `🥚 �_E𝗴𝗴𝘀:\n${egg.egg?.join("\n") || "No eggs."}\n\n` +
            `🌤️ 𝗪𝗲𝗮𝘁𝗵𝗲𝗿: ${weatherIcon} ${weatherDesc}\n🪴 𝗕𝗼𝗻𝘂𝘀: ${weatherBonus}\n\n` +
            `📅 𝗚𝗲𝗮𝗿/𝗦𝗲𝗲𝗱 𝗨𝗽𝗱𝗮𝘁𝗲𝗱: ${gearTime}\n🔁 𝗥𝗲𝘀𝗲𝘁 𝗶𝗻: ${gearResetText}\n\n` +
            `📅 𝗘𝗴𝗴 𝗨𝗽𝗱𝗮𝘁𝗲𝗱: ${eggTime}\n🔁 𝗥𝗲𝘀�_e𝘁 𝗶𝗻: ${eggResetText}\n\n` +
            `📦 𝗛𝗼𝗻𝗲𝘆 𝗦𝘁𝗼𝗰𝗸:\n${honeyText}`;

          if (message !== sessionData.lastMessage) {
            sessionData.lastMessage = message;
            await api.sendMessage(message, threadID, messageID);
          }
        } catch (error) {
          console.error(`Error in gagstock for ${senderID}: ${error.message}`);
          await api.sendMessage(getLang("error", error.message), threadID, messageID);
        }
      };

      sessionData.interval = setInterval(fetchAll, 30 * 1000);
      activeSessions.set(senderID, sessionData);
      await fetchAll();
    } catch (error) {
      console.error(`Error in gagstock: ${error.message}`);
      return api.sendMessage(getLang("error", error.message), threadID, messageID);
    }
  }
};
