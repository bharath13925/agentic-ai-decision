import React from "react";
import { motion } from "framer-motion";

const sections = [
  {
    title: "1. Information We Collect",
    content:
      "We collect information you provide directly to us, such as your name, email address, and password when you create an account. We also collect data you upload to the platform for analysis, as well as usage data such as log files, device information, and interaction data.",
  },
  {
    title: "2. How We Use Your Information",
    content:
      "We use the information we collect to provide, maintain, and improve our services; authenticate your identity; process your requests and transactions; send you technical notices and support messages; and monitor and analyze trends and usage.",
  },
  {
    title: "3. Data Storage & Security",
    content:
      "Your data is stored securely using Firebase (Google Cloud infrastructure). We implement industry-standard security measures including encryption in transit and at rest. However, no method of transmission over the internet is 100% secure.",
  },
  {
    title: "4. Data Sharing",
    content:
      "We do not sell, trade, or rent your personal information to third parties. We may share data with trusted service providers who assist us in operating the platform, subject to confidentiality agreements.",
  },
  {
    title: "5. Cookies",
    content:
      "We use cookies and similar tracking technologies to track activity on our service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.",
  },
  {
    title: "6. Your Rights",
    content:
      "You have the right to access, update, or delete the information we hold about you. You may also request data portability or restrict processing. To exercise these rights, contact us at contact@agenticiq.ai.",
  },
  {
    title: "7. Changes to This Policy",
    content:
      "We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the effective date.",
  },
  {
    title: "8. Contact Us",
    content:
      "If you have any questions about this Privacy Policy, please contact us at contact@agenticiq.ai.",
  },
];

export default function PrivacyPolicy() {
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
          <span className="text-xs font-mono text-[#7C5CFF] tracking-widest uppercase mb-3 block">
            Legal
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-3">Privacy Policy</h1>
          <p className="text-[#9CA3AF] text-sm mb-10">
            Effective date: March 14, 2026 &nbsp;·&nbsp; AgenticIQ Platform
          </p>

          <p className="text-[#9CA3AF] leading-relaxed mb-10">
            AgenticIQ ("we", "our", "us") is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your information when you use our platform.
          </p>

          <div className="flex flex-col gap-8">
            {sections.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.5 }}
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