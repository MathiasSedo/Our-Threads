import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

export async function processVoice(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    return res.status(503).json({ error: 'Voice processing is not configured on this server.' });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
    });

    const text = transcription.text;

    // Extract structured data with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Extract contact information from this spoken note. Return ONLY a JSON object with these exact keys:
- name (string, required)
- city (string)
- country (string)
- how_we_met (string — the story: how you met, what happened, what they mean to you)
- contact_info (string — email, phone, instagram, etc.)
- suggested_tags (array of strings from: Visit, Work, Family, "Invite for wedding", or custom)

Spoken note: "${text}"

Return only the JSON, no explanation.`
      }],
    });

    let extracted = {};
    try {
      const content = message.content[0].text;
      extracted = JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    } catch {
      extracted = {};
    }

    fs.unlinkSync(req.file.path);
    res.json({ transcript: text, extracted });
  } catch (e) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    console.error('Voice processing error:', e);
    res.status(500).json({ error: 'Failed to process audio' });
  }
}
