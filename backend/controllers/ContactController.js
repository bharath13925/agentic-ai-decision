const nodemailer = require("nodemailer");
const Contact    = require("../models/Contact");

/* ─────────────────────────────────────────────
   Build the HTML email body
───────────────────────────────────────────── */
function buildEmailHTML({ name, email, message, sentAt }) {
  const dateStr = new Date(sentAt).toLocaleString("en-IN", {
    timeZone:  "Asia/Kolkata",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Contact Message — AgenticIQ</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #05050A; font-family: 'Inter', sans-serif; color: #E6E6EB; }
  </style>
</head>
<body style="background:#05050A; padding: 32px 16px;">

  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto;">

    <!-- TOP ACCENT BAR -->
    <tr>
      <td style="height:3px; background: linear-gradient(90deg,#7C5CFF,#FF4FD8,#00E0FF); border-radius:3px 3px 0 0;"></td>
    </tr>

    <!-- CARD -->
    <tr>
      <td style="background:linear-gradient(145deg,#0E0E18,#0B0B12);
                 border: 1px solid rgba(255,255,255,0.09);
                 border-top: none;
                 border-radius: 0 0 24px 24px;
                 padding: 40px 40px 32px;">

        <!-- LOGO ROW -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
          <tr>
            <td>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#7C5CFF,#00E0FF);
                             border-radius:12px; width:40px; height:40px;
                             text-align:center; vertical-align:middle;">
                    <span style="color:#fff; font-size:20px; line-height:40px;">⚡</span>
                  </td>
                  <td style="padding-left:12px;">
                    <span style="font-weight:900; font-size:20px; color:#7C5CFF;">Agentic</span><span style="font-weight:900; font-size:20px; color:#00E0FF;">IQ</span>
                  </td>
                </tr>
              </table>
            </td>
            <td align="right">
              <span style="font-size:11px; font-family:monospace; color:#9CA3AF; background:rgba(124,92,255,0.12);
                           border:1px solid rgba(124,92,255,0.3); padding:4px 10px; border-radius:20px;">
                NEW MESSAGE
              </span>
            </td>
          </tr>
        </table>

        <!-- HEADLINE -->
        <h1 style="font-size:26px; font-weight:900; color:#fff; margin-bottom:6px;">
          You received a new message
        </h1>
        <p style="font-size:13px; color:#9CA3AF; margin-bottom:32px; font-family:monospace;">
          ${dateStr} (IST) · AgenticIQ Contact Form
        </p>

        <!-- DIVIDER -->
        <div style="height:1px; background:linear-gradient(90deg,transparent,rgba(124,92,255,0.4),transparent); margin-bottom:28px;"></div>

        <!-- FROM BLOCK -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td style="background:rgba(124,92,255,0.08); border:1px solid rgba(124,92,255,0.22);
                       border-radius:16px; padding:20px 22px;">
              <p style="font-size:10px; font-family:monospace; color:#7C5CFF;
                         text-transform:uppercase; letter-spacing:0.2em; margin-bottom:12px;">
                📬 From
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:8px;">
                    <span style="font-size:11px; color:#9CA3AF; font-family:monospace;">NAME &nbsp;</span>
                    <span style="font-size:15px; font-weight:700; color:#E6E6EB;">${escapeHtml(name)}</span>
                  </td>
                </tr>
                <tr>
                  <td>
                    <span style="font-size:11px; color:#9CA3AF; font-family:monospace;">EMAIL &nbsp;</span>
                    <a href="mailto:${escapeHtml(email)}"
                       style="font-size:14px; font-weight:600; color:#00E0FF; text-decoration:none;">
                      ${escapeHtml(email)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- MESSAGE BLOCK -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td style="background:rgba(0,224,255,0.05); border:1px solid rgba(0,224,255,0.18);
                       border-left: 3px solid #00E0FF;
                       border-radius:0 16px 16px 0; padding:20px 22px;">
              <p style="font-size:10px; font-family:monospace; color:#00E0FF;
                         text-transform:uppercase; letter-spacing:0.2em; margin-bottom:14px;">
                💬 Message
              </p>
              <p style="font-size:14px; color:#E6E6EB; line-height:1.75; white-space:pre-wrap;">
${escapeHtml(message)}
              </p>
            </td>
          </tr>
        </table>

        <!-- REPLY CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td align="center">
              <a href="mailto:${escapeHtml(email)}?subject=Re: Your message to AgenticIQ"
                 style="display:inline-block; background:linear-gradient(135deg,#7C5CFF,#FF4FD8);
                        color:#fff; font-weight:700; font-size:14px;
                        padding:13px 32px; border-radius:12px; text-decoration:none;
                        letter-spacing:0.02em;">
                ↩ Reply to ${escapeHtml(name)}
              </a>
            </td>
          </tr>
        </table>

        <!-- DIVIDER -->
        <div style="height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); margin-bottom:20px;"></div>

        <!-- FOOTER -->
        <p style="font-size:11px; color:#9CA3AF; font-family:monospace; text-align:center; line-height:1.6;">
          This message was sent from the <strong style="color:#7C5CFF;">AgenticIQ</strong> contact form.<br/>
          If this looks suspicious, you can safely ignore it.
        </p>

      </td>
    </tr>

    <!-- BOTTOM GLOW -->
    <tr>
      <td style="padding-top:20px; text-align:center;">
        <p style="font-size:10px; color:#4B5563; font-family:monospace;">
          © 2026 AgenticIQ · Decision Intelligence Platform
        </p>
      </td>
    </tr>

  </table>
</body>
</html>
  `.trim();
}

/* Simple HTML escape to prevent injection */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

/* ─────────────────────────────────────────────
   Create transporter (per-request so env vars are always fresh)
───────────────────────────────────────────── */
function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASS environment variables. " +
      "Email cannot be sent without valid SMTP credentials."
    );
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

/* ─────────────────────────────────────────────
   POST /api/contact
   Body: { name, email, message }
───────────────────────────────────────────── */
const sendContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // ── Validation ──
    if (!name || !email || !message)
      return res.status(400).json({ message: "name, email and message are required." });
    if (name.trim().length < 2)
      return res.status(400).json({ message: "Name must be at least 2 characters." });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ message: "Please enter a valid email address." });
    if (message.trim().length < 10)
      return res.status(400).json({ message: "Message must be at least 10 characters." });

    // ── Resolve recipient from env ──
    const recipientEmail = process.env.CONTACT_RECIPIENT_EMAIL;
    if (!recipientEmail) {
      console.error("[ContactController] CONTACT_RECIPIENT_EMAIL env var is not set.");
      return res.status(500).json({
        message: "Contact form is not configured. Please try again later.",
      });
    }

    const sentAt = new Date();

    // ── Save to MongoDB ──
    await Contact.create({
      name:      name.trim(),
      email:     email.trim().toLowerCase(),
      message:   message.trim(),
      sentAt,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "unknown",
    });

    // ── Send email via nodemailer ──
    // "from" must be the authenticated sender (GMAIL_USER).
    // User's name/email goes in replyTo only — mixing them in "from" causes
    // DMARC failures and spam-filter rejections on many providers.
    const transporter = createTransporter();

    await transporter.sendMail({
      from:    `"AgenticIQ Contact" <${process.env.GMAIL_USER}>`,
      to:      recipientEmail,
      replyTo: `${name.trim()} <${email.trim()}>`,
      subject: `📬 New message from ${name.trim()} — AgenticIQ`,
      html:    buildEmailHTML({
        name:    name.trim(),
        email:   email.trim(),
        message: message.trim(),
        sentAt,
      }),
      text: [
        `From   : ${name.trim()} <${email.trim()}>`,
        `Date   : ${sentAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
        `---`,
        message.trim(),
      ].join("\n"),
    });

    return res.status(200).json({ message: "Message sent successfully." });
  } catch (err) {
    console.error("[ContactController] Error:", err);
    return res.status(500).json({ message: "Failed to send message. Please try again." });
  }
};

module.exports = { sendContactMessage };