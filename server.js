
const express = require("express");

const app = express();
app.use(express.json({ limit: "4kb" }));

const PORT = process.env.PORT || 3000;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_ID = process.env.ROLE_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BLOXLINK_API_KEY = process.env.BLOXLINK_API_KEY;
const API_SECRET = process.env.API_SECRET;

const requiredEnv = [
  "GUILD_ID",
  "ROLE_ID",
  "DISCORD_BOT_TOKEN",
  "BLOXLINK_API_KEY",
  "API_SECRET"
];

if (requiredEnv.some((key) => !process.env[key])) {
  console.error("Missing required Railway environment variables.");
  process.exit(1);
}

app.get("/", (_req, res) => {
  res.json({ service: "Roblox role verification", status: "online" });
});

app.post("/check", async (req, res) => {
  // Only accept requests authenticated by your Roblox server script.
  if (req.get("x-api-key") !== API_SECRET) {
    return res.status(401).json({ verified: false });
  }

  const userId = String(req.body?.userId ?? "");

  if (!/^\d{1,20}$/.test(userId)) {
    return res.status(400).json({ verified: false });
  }

  try {
    // Find Discord account(s) linked to this Roblox account
    // and present in the configured Bloxlink guild.
    const linkResponse = await fetch(
      `https://api.blox.link/v4/public/guilds/${GUILD_ID}/roblox-to-discord/${userId}`,
      {
        headers: { Authorization: BLOXLINK_API_KEY },
        signal: AbortSignal.timeout(8000)
      }
    );

    if (!linkResponse.ok) {
      if (linkResponse.status === 404) {
        return res.json({ verified: false });
      }

      console.error("Bloxlink lookup failed:", linkResponse.status);
      return res.status(502).json({ verified: false });
    }

    const linkData = await linkResponse.json();
    const discordIds = Array.isArray(linkData.discordIDs)
      ? linkData.discordIDs
      : [];

    if (discordIds.length === 0) {
      return res.json({ verified: false });
    }

    // Verify each linked Discord ID against the actual guild member
    // record. A missing member or missing role never grants access.
    for (const discordId of discordIds) {
      if (!/^\d{1,20}$/.test(String(discordId))) continue;

      const memberResponse = await fetch(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
        {
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`
          },
          signal: AbortSignal.timeout(8000)
        }
      );

      if (memberResponse.status === 404) continue;

      if (!memberResponse.ok) {
        console.error("Discord member lookup failed:", memberResponse.status);
        return res.status(502).json({ verified: false });
      }

      const member = await memberResponse.json();
      const roles = Array.isArray(member.roles) ? member.roles : [];

      if (roles.includes(ROLE_ID)) {
        return res.json({ verified: true });
      }
    }

    return res.json({ verified: false });
  } catch (error) {
    console.error("Verification request failed:", error.message);
    return res.status(502).json({ verified: false });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Role-check API listening on port ${PORT}`);
});
