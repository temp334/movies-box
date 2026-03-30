const { addonBuilder } = require("stremio-addon-sdk");
const express = require("express");
const crypto = require("crypto");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = "https://api3.aoneroom.com";

// 🔐 Helpers
function md5(input) {
    return crypto.createHash("md5").update(input).digest("hex");
}

function reverseString(str) {
    return str.split("").reverse().join("");
}

function generateXClientToken() {
    const timestamp = Date.now().toString();
    const reversed = reverseString(timestamp);
    const hash = md5(reversed);
    return `${timestamp},${hash}`;
}

function buildCanonicalString(method, url, body, timestamp) {
    const path = new URL(url).pathname;
    const bodyHash = body ? md5(body) : "";
    const bodyLength = body ? body.length : "";

    return `${method.toUpperCase()}\n\n\n${bodyLength}\n${timestamp}\n${bodyHash}\n${path}`;
}

function generateSignature(method, url, body = "") {
    const timestamp = Date.now();
    const canonical = buildCanonicalString(method, url, body, timestamp);

    const secret = Buffer.from("NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==", "base64");

    const hmac = crypto.createHmac("md5", secret);
    hmac.update(canonical);

    const signature = hmac.digest("base64");

    return `${timestamp}|2|${signature}`;
}

// 🎬 Stremio Addon
const manifest = {
    id: "moviebox.addon",
    version: "1.0.0",
    name: "MovieBox Stremio",
    description: "Converted from Cloudstream",

    resources: ["stream", "catalog", "meta"],

    types: ["movie", "series"],

    idPrefixes: ["tt"],

    catalogs: [ ]
};

const builder = new addonBuilder(manifest);

// 🎥 STREAM HANDLER
builder.defineStreamHandler(async ({ type, id }) => {
    try {
        const subjectId = id.replace("tt", "");

        const url = `${BASE_URL}/wefeed-mobile-bff/subject-api/play-info?subjectId=${subjectId}&se=1&ep=1`;

        const headers = {
            "x-client-token": generateXClientToken(),
            "x-tr-signature": generateSignature("GET", url),
            "user-agent": "okhttp/4.9.0"
        };

        const res = await fetch(url, { headers });
        const json = await res.json();

        const streams = json?.data?.streams || [];

        return {
            streams: streams.map(s => ({
                title: "MovieBox",
                url: s.url
            }))
        };

    } catch (err) {
        console.log(err);
        return { streams: [] };
    }
});

// 🌐 Express server
app.get("/manifest.json", (req, res) => {
    res.json(manifest);
});

app.use("/", builder.getInterface());

app.listen(PORT, () => {
    console.log(`Addon running on ${PORT}`);
});
