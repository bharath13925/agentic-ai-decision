import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiMail, FiMessageSquare, FiChevronDown, FiSend, FiBook, FiZap, FiShield, FiUser } from "react-icons/fi";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: "easeOut" },
});

const faqs = [
  { q: "How do I get started with AgenticIQ?", a: "Click 'Get Started Free' on the landing page, create an account, and you'll be redirected to your dashboard where you can upload a dataset and run your first analysis." },
  { q: "What file formats are supported for dataset upload?", a: "Currently we support CSV and Excel (.xlsx) formats. The dataset should have column headers in the first row for best results." },
  { q: "How does the multi-agent pipeline work?", a: "The Observer Agent ingests your data, the Analyst Agent applies XGBoost/LightGBM models, the Simulation Agent runs scenario forecasts, and the Decision Agent outputs ranked strategy recommendations with SHAP explanations." },
  { q: "Is my data secure?", a: "Yes. All data is encrypted in transit and at rest using Firebase/Google Cloud infrastructure. We do not share your data with third parties." },
  { q: "Can I use Google to sign in?", a: "Yes — both Google OAuth and email/password authentication are supported on the signup and login pages." },
  { q: "How do I reset my password?", a: "On the login page, use the 'Forgot Password' option (coming soon). For now, contact us at contact@agenticiq.ai and we'll assist you." },
  { q: "What ML models power the analysis?", a: "We use an ensemble of Random Forest, XGBoost, and LightGBM. SHAP (SHapley Additive exPlanations) provides per-feature explainability for every prediction." },
  { q: "Is there a free tier?", a: "Yes — AgenticIQ is currently free during our hackathon/beta phase. Pricing tiers will be introduced in future releases." },
];

const categories = [
  { icon: <FiBook size={20} />,    title: "Getting Started",   desc: "Setup, onboarding, and first analysis guide.",   color: "#7C5CFF" },
  { icon: <FiZap size={20} />,     title: "Platform Features",  desc: "Deep dive into agents, models, and dashboards.", color: "#00E0FF" },
  { icon: <FiShield size={20} />,  title: "Security & Privacy", desc: "Data handling, encryption, and compliance.",     color: "#FF4FD8" },
  { icon: <FiUser size={20} />,    title: "Account & Billing",  desc: "Profile, authentication, and plan management.",  color: "#7C5CFF" },
];

function FAQItem({ q, a, index }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.5 }}
      className="border border-white/10 rounded-xl overflow-hidden bg-[#111118] hover:border-[#7C5CFF]/30 transition-colors duration-300"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-[#E6E6EB] font-medium text-sm">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3 }}
          className="text-[#7C5CFF] ml-4 shrink-0"
        >
          <FiChevronDown size={18} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="px-6 pb-5 pt-3 text-[#9CA3AF] text-sm leading-relaxed border-t border-white/5">
              {a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Support() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
    setForm({ name: "", email: "", subject: "", message: "" });
    setTimeout(() => setSent(false), 5000);
  };

  return (
    <div
      className="min-h-screen text-[#E6E6EB] pt-28 pb-20 px-6"
      style={{
        background: `
          radial-gradient(circle at 20% 30%, #7c5cff15, transparent 50%),
          radial-gradient(circle at 80% 70%, #00e0ff10, transparent 50%),
          #0B0B0F
        `,
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <motion.div {...fadeUp(0)} className="text-center mb-16">
          <span className="text-xs font-mono text-[#7C5CFF] tracking-widest uppercase mb-3 block">
            Help Center
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
            How can we{" "}
            <span style={{
              background: "linear-gradient(90deg, #7C5CFF, #00E0FF)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              help you?
            </span>
          </h1>
          <p className="text-[#9CA3AF] max-w-xl mx-auto text-sm leading-relaxed">
            Browse our FAQs, explore support categories, or send us a message
            and we'll get back to you as soon as possible.
          </p>
        </motion.div>

        {/* ── Support Categories ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {categories.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              whileHover={{ scale: 1.04, boxShadow: `0 0 30px ${c.color}22` }}
              className="bg-[#111118] border border-white/10 rounded-2xl p-5 cursor-pointer transition-all duration-300 group"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all duration-300"
                style={{ background: `${c.color}20`, color: c.color }}
              >
                {c.icon}
              </div>
              <h3 className="text-[#E6E6EB] font-semibold text-sm mb-1">{c.title}</h3>
              <p className="text-[#9CA3AF] text-xs leading-relaxed">{c.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* ── FAQ ── */}
        <motion.div {...fadeUp(0.2)} className="mb-16">
          <div className="text-center mb-10">
            <span className="text-xs font-mono text-[#00E0FF] tracking-widest uppercase mb-3 block">
              FAQ
            </span>
            <h2 className="text-3xl font-black text-white">Frequently Asked Questions</h2>
          </div>
          <div className="flex flex-col gap-3">
            {faqs.map((faq, i) => (
              <FAQItem key={i} {...faq} index={i} />
            ))}
          </div>
        </motion.div>

        {/* ── Contact Form + Info ── */}
        <div className="grid md:grid-cols-2 gap-8 items-start">
          {/* Form */}
          <motion.div {...fadeUp(0.3)} className="bg-[#111118] border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-2 mb-6">
              <FiMessageSquare className="text-[#7C5CFF]" size={20} />
              <h2 className="text-white font-bold text-lg">Send a Message</h2>
            </div>

            {sent && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm"
              >
                ✓ Message sent! We'll get back to you within 24 hours.
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Your name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <input
                type="text"
                placeholder="Subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all"
              />
              <textarea
                rows={5}
                placeholder="Describe your issue or question..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-[#E6E6EB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#7C5CFF]/60 focus:bg-[#7C5CFF]/5 transition-all resize-none"
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.03, boxShadow: "0 0 30px rgba(124,92,255,0.5)" }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-white bg-linear-to-r from-[#7C5CFF] to-[#00E0FF] shadow-[0_0_20px_rgba(124,92,255,0.35)] transition-all"
              >
                <FiSend size={16} />
                Send Message
              </motion.button>
            </form>
          </motion.div>

          {/* Contact Info */}
          <motion.div {...fadeUp(0.4)} className="flex flex-col gap-5">
            <div className="bg-[#111118] border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-[#00E0FF]/10 border border-[#00E0FF]/20 flex items-center justify-center text-[#00E0FF]">
                  <FiMail size={16} />
                </div>
                <div>
                  <p className="text-white text-sm font-semibold">Email Support</p>
                  <p className="text-[#9CA3AF] text-xs">Typically responds within 24 hours</p>
                </div>
              </div>
              <a
                href="mailto:contact@agenticiq.ai"
                className="text-[#00E0FF] text-sm hover:underline transition-colors"
              >
                bharathbandi13925@gmail.com
              </a>
            </div>

            <div className="bg-[#111118] border border-[#7C5CFF]/20 rounded-2xl p-6"
              style={{ background: "radial-gradient(circle at 30% 30%, #7c5cff10, transparent 60%), #111118" }}>
              <h3 className="text-white font-semibold text-sm mb-2">About AgenticIQ</h3>
              <p className="text-[#9CA3AF] text-xs leading-relaxed">
                AgenticIQ is an Agentic AI Decision Intelligence Platform built
                for hackathons and real-world business use cases. Powered by
                XGBoost, LightGBM, and SHAP on a MERN stack.
              </p>
            </div>
          </motion.div>
        </div>

      </div>
    </div>
  );
}