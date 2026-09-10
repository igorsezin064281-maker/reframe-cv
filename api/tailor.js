const formidable = require('formidable');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const { applyDocxEdits } = require('../lib/applyDocxEdits');

const MAX_WORDS = 2000;
const countWords = value => value.trim() ? value.trim().split(/\s+/).length : 0;

module.exports = async function tailor(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://igorsezin064281-maker.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not configured.' });
  try {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024, allowEmptyFiles: false });
    const [fields, files] = await form.parse(req);
    const jobDescription = String(fields.jobDescription?.[0] || '');
    const cv = files.cv?.[0];
    if (!cv || !cv.originalFilename?.toLowerCase().endsWith('.docx')) return res.status(400).json({ error: 'Please upload a DOCX CV.' });
    if (countWords(jobDescription) < 20 || countWords(jobDescription) > MAX_WORDS) return res.status(400).json({ error: 'Job description must contain 20 to 2,000 words.' });
    const { value: cvText } = await mammoth.extractRawText({ path: cv.filepath });
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const answer = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        { role: 'system', content: 'Return JSON only: {"edits":[{"original":"exact CV text","replacement":"supported rewrite","reason":"reason"}],"rejectedClaims":["unsupported claim"]}. Never invent facts. Never change names, dates, employers, titles, metrics, qualifications or contact details. Only rewrite evidence present in the CV.' },
        { role: 'user', content: `JOB DESCRIPTION:\n${jobDescription}\n\nSOURCE CV:\n${cvText}` }
      ],
      text: { format: { type: 'json_object' } }
    });
    const result = JSON.parse(answer.output_text);
    const document = await applyDocxEdits(cv.filepath, Array.isArray(result.edits) ? result.edits : []);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="tailored-${cv.originalFilename.replace(/[^a-z0-9._-]/gi, '_')}"`);
    return res.status(200).send(document.buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Tailoring failed. The original document was not changed.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
