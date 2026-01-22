const express = require("express");
const router = express.Router();
const { chatWithAI } = require("../utils/ai");

router.post("/chat", async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Message is required" });
    }

    try {
        const response = await chatWithAI(message);
        res.json({ response });
    } catch (err) {
        console.error("Chat route error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
