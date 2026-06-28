import React from "react";
import { LegalShell } from "@/pages/Terms";
import { SUPPORT_EMAIL } from "@/lib/contact";

const Section = ({ n, title, children }) => (
  <section>
    <h2 className="ff-head text-xl font-bold text-white mb-2">{n}. {title}</h2>
    {children}
  </section>
);

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="June 2026">
      <p>This Privacy Policy explains how CAVI collects, uses, and protects your information when you use our platform.</p>
      <Section n="1" title="Information We Collect">
        <p>We collect the email address and username you provide at sign-up, wallet addresses you connect or that we generate for you, transaction records (deposits, withdrawals, staking rewards), and technical data such as device and login information used for security.</p>
      </Section>
      <Section n="2" title="How We Use Your Information">
        <p>We use your information to operate your account, process deposits and withdrawals, calculate staking rewards, send transactional and security emails, provide support, and detect or prevent fraud and abuse.</p>
      </Section>
      <Section n="3" title="Wallet Keys & Security">
        <p>Generated wallet private keys are encrypted at rest using strong encryption. We apply industry-standard safeguards, brute-force protection, and new-device login alerts to help protect your account.</p>
      </Section>
      <Section n="4" title="Cookies & Local Storage">
        <p>We use local storage to keep you signed in and to maintain your live-chat session. We do not sell your personal data.</p>
      </Section>
      <Section n="5" title="Sharing of Information">
        <p>We do not sell your data. We may share limited information with service providers (e.g. email delivery) strictly to operate the platform, or where required by law.</p>
      </Section>
      <Section n="6" title="Data Retention">
        <p>We retain account and transaction records for as long as your account is active and as required for legal, accounting, and security purposes.</p>
      </Section>
      <Section n="7" title="Your Rights">
        <p>You may request access to, correction of, or deletion of your personal data, subject to legal and operational limits. Contact us to exercise these rights.</p>
      </Section>
      <Section n="8" title="Changes to This Policy">
        <p>We may update this policy periodically. Material changes will be reflected by the "Last updated" date above.</p>
      </Section>
      <Section n="9" title="Contact">
        <p>For privacy questions, email <a className="text-[#00d4a0]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or message us on WhatsApp / live chat.</p>
      </Section>
    </LegalShell>
  );
}
