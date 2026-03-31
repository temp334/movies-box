const { addonBuilder } = require("stremio-addon-sdk");
const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = "https://api3.aoneroom.com";

// ================= HELPERS =================
const md5 = (d) => crypto.createHash("md5").update(d).digest("hex");

function generateToken() {
    const t = Date.now().toString();
    return `${t},${md5(t.split("").reverse().join(""))}`;
}

function sign(method, url, body = "") {
    const ts = Date.now();
    const path = new URL(url).pathname;
    const canonical = `${method}\n\n\n${body.length || ""}\n${ts}\n${body ? md5(body) : ""}\n${path}`;
    const key = Buffer.from("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==", "base64");

    const h = crypto.createHmac("md5", key);
    h.update(canonical);
    return `${ts}|2|${h.digest("base64")}`;
}

function headers(url, method = "GET", body = "") {
    return {
        "user-agent": "okhttp/4.9.0",
        "content-type": "application/json",
        "x-client-token": generateToken(),
        "x-tr-signature": sign(method, url, body)
    };
}

// ================= MANIFEST =================
const manifest = {
    id: "moviebox.god",
    version: "3.0.0",
    name: "MovieBox GOD",
    description: "Ultimate Cloudstream Conversion",

    resources: ["stream", "catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["mbx"],

    catalogs: [
        { type: "movie", id: "mbx_movies", name: "🔥 Movies" },
        { type: "series", id: "mbx_series", name: "📺 Series" }
    ]
};

const builder = new addonBuilder(manifest);

// ================= CATALOG =================
builder.defineCatalogHandler(async ({ type, extra }) => {
    try {
        // 🔍 SEARCH
        if (extra?.search) {
            const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/search/v2`;
            const body = JSON.stringify({ page: 1, perPage: 20, keyword: extra.search });

            const res = await fetch(url, {
                method: "POST",
                headers: headers(url, "POST", body),
                body
            });

            const j = await res.json();

            let metas = [];
            j?.data?.results?.forEach(r => {
                r.subjects?.forEach(s => {
                    metas.push({
                        id: "mbx" + s.subjectId,
                        type: s.subjectType === 2 ? "series" : "movie",
                        name: s.title,
                        poster: s.cover?.url
                    });
                });
            });

            return { metas };
        }

        // 🎬 HOMEPAGE
        const url = `${BASE_URL}/wefeed-mobile-bff/tab/ranking-list?tabId=0&categoryType=${type === "series" ? 2 : 1}&page=1&perPage=20`;

        const res = await fetch(url, { headers: headers(url) });
        const j = await res.json();

        return {
            metas: (j?.data?.items || []).map(i => ({
                id: "mbx" + i.subjectId,
                type,
                name: i.title,
                poster: i.cover?.url
            }))
        };

    } catch (e) {
        return { metas: [] };
    }
});

// ================= META =================
builder.defineMetaHandler(async ({ id }) => {
    try {
        const sid = id.replace("mbx", "");
        const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/get?subjectId=${sid}`;

        const res = await fetch(url, { headers: headers(url) });
        const j = await res.json();
        const d = j?.data;

        if (!d) return { meta: null };

        let videos = [];

        // 📺 SERIES SUPPORT
        if (d.subjectType === 2) {
            const sUrl = `${BASE_URL}/wefeed-mobile-bff/subject-api/season-info?subjectId=${sid}`;
            const sRes = await fetch(sUrl, { headers: headers(sUrl) });
            const sJson = await sRes.json();

            sJson?.data?.seasons?.forEach(season => {
                for (let ep = 1; ep <= season.maxEp; ep++) {
                    videos.push({
                        id: `${id}:${season.se}:${ep}`,
                        title: `S${season.se}E${ep}`,
                        season: season.se,
                        episode: ep
                    });
                }
            });
        }

        return {
            meta: {
                id,
                type: d.subjectType === 2 ? "series" : "movie",
                name: d.title,
                poster: d.cover?.url,
                background: d.cover?.url,
                description: d.description,
                videos
            }
        };

    } catch {
        return { meta: null };
    }
});

// ================= STREAM =================
builder.defineStreamHandler(async ({ id }) => {
    try {
        let sid = id.replace("mbx", "");
        let se = 1, ep = 1;

        if (id.includes(":")) {
            const parts = id.split(":");
            sid = parts[0].replace("mbx", "");
            se = parts[1];
            ep = parts[2];
        }

        const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${sid}&se=${se}&ep=${ep}`;

        const res = await fetch(url, { headers: headers(url) });
        const j = await res.json();

        const streams = j?.data?.streams || [];

        // 🌍 MULTI LANGUAGE LABEL
        return {
            streams: streams.map(s => ({
                title: `🌐 ${s.resolutions || "Auto"}`,
                url: s.url
            }))
        };

    } catch {
        return { streams: [] };
    }
});

// ================= SERVER =================
app.get("/manifest.json", (req, res) => res.json(manifest));
app.use("/", builder.getInterface());

app.listen(PORT, () => console.log("🔥 GOD MODE RUNNING"));
