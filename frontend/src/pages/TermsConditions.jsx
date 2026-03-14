import React from "react";
import { motion } from "framer-motion";

const sections = [
  {
    title: "1. Acceptance of Terms",
    content:
      "By accessing or using AgenticIQ, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our platform.",
  },
  {
    title: "2. Use of the Platform",
    content:
      "You agree to use AgenticIQ only for lawful purposes and in accordance with these Terms. You may not use the platform in any way that violates applicable laws, infringes on intellectual property rights, or transmits harmful or malicious code.",
  },
  {
    title: "3. User Accounts",
    content:
      "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.",
  },
  {
    title: "4. Data & Content",
    content:
      "You retain ownership of any data or content you upload to the platform. By uploading data, you grant AgenticIQ a limited, non-exclusive license to process that data solely to provide the service to you.",
  },
  {
    title: "5. Intellectual Property",
    content:
      "The AgenticIQ platform, including its software, design, and ML models, is the exclusive property of AgenticIQ. You may not reproduce, distribute, or create derivative works without our prior written consent.",
  },
  {
    title: "6. Disclaimers",
    content:
      "AgenticIQ is provided 'as is' without warranties of any kind, express or implied. We do not guarantee that the platform will be uninterrupted, error-free, or that results generated will be accurate for any specific business decision.",
  },
  {
    title: "7. Limitation of Liability",
    content:
      "To the fullest extent permitted by law, AgenticIQ shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.",
  },
  {
    title: "8. Termination",
    content:
      "We reserve the right to suspend or terminate your access to the platform at our discretion, without notice, if we believe you have violated these Terms.",
  },
  {
    title: "9. Governing Law",
    content:
      "These Terms shall be governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Vijayawada, Andhra Pradesh.",
  },
  {
    title: "10. Contact",
    content:
      "For questions about these Terms, please contact us at contact@agenticiq.ai.",
  },
];

export default function TermsConditions() {
  return (
    <div
      className="min-h-screen text-[#E6E6EB] pt-28 pb-20 px-6"
      style={{ background: "#0B0B0F" }}
    >
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-mono text-[#00E0FF] tracking-widest uppercase mb-3 block">
            Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">
            Terms & Conditions
          </h1>
          <p className="text-[#9CA3AF] text-sm mb-10">
            Effective date: March 14, 2026 &nbsp;·&nbsp; AgenticIQ Platform
          </p>

          <p className="text-[#9CA3AF] leading-relaxed mb-10">
            Please read these Terms and Conditions carefully before using the
            AgenticIQ platform. These terms constitute a legally binding
            agreement between you and AgenticIQ.
          </p>

          <div className="flex flex-col gap-8">
            {sections.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.5 }}
                className="bg-[#111118] border border-white/10 rounded-2xl p-6"
              >
                <h2 className="text-white font-bold text-base mb-3">{s.title}</h2>
                <p className="text-[#9CA3AF] text-sm leading-relaxed">{s.content}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}