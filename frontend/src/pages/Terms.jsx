import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Footer from "@/components/Footer";
import { SUPPORT_EMAIL } from "@/lib/contact";

export function LegalShell({ title, updated, children }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white flex flex-col">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg" style={{ background: "linear-gradient(135deg,#00d4a0,#6c63ff)" }} />
            <span className="ff-head font-bold text-lg">CAVI</span>
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white inline-flex items-center gap-1.5"><ArrowLeft className="w-4 h-4" /> Back home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-14 flex-1 w-full">
        <h1 className="ff-head text-3xl md:text-4xl font-bold">{title}</h1>
        <p className="text-white/40 text-sm mt-2 ff-mono">Last updated: {updated}</p>
        <div className="mt-8 space-y-7 text-white/65 text-[15px] leading-relaxed legal-body">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

const Section = ({ n, title, children }) => (
  <section>
    <h2 className="ff-head text-xl font-bold text-white mb-2">{n}. {title}</h2>
    {children}
  </section>
);

export default function Terms() {
  return (
    <LegalShell title="Terms & Conditions" updated="June 2026">
      <p>Welcome to CAVI. By accessing or using our platform, you agree to be bound by these Terms &amp; Conditions. Please read them carefully before depositing any funds.</p>
      <Section n="1" title="Eligibility">
        <p>You must be at least 18 years old and legally permitted to use crypto-asset services in your jurisdiction. You are solely responsible for compliance with the laws applicable to you.</p>
      </Section>
      <Section n="2" title="Nature of the Service">
        <p>CAVI generates self-custodied deposit wallets and allocates your deposit base across validator-node staking on Ethereum, Solana, BNB Chain and TRON. Staking rewards are calculated on your deposit base and are variable; they are not fixed, guaranteed, or compounded.</p>
      </Section>
      <Section n="3" title="No Investment Advice">
        <p>Nothing on this platform constitutes financial, investment, legal, or tax advice. Crypto assets are volatile and you may lose value. You invest at your own risk.</p>
      </Section>
      <Section n="4" title="Deposits & Withdrawals">
        <p>Deposits are credited once confirmed on-chain. Withdrawals are processed to the address you specify. A small early-withdrawal penalty may apply during the daily maintenance window. You are responsible for providing correct withdrawal addresses; on-chain transactions are irreversible.</p>
      </Section>
      <Section n="5" title="Referral Program">
        <p>Referral rewards are a percentage of an active referee's staking profit, paid on your selected schedule, and only while the referee maintains a positive balance. CAVI may adjust referral terms with notice.</p>
      </Section>
      <Section n="6" title="Account Security">
        <p>You are responsible for safeguarding your credentials. Notify us immediately of any unauthorized access. CAVI is not liable for losses arising from compromised credentials.</p>
      </Section>
      <Section n="7" title="Prohibited Use">
        <p>You may not use CAVI for money laundering, fraud, or any unlawful activity. We reserve the right to suspend accounts that violate these terms or applicable law.</p>
      </Section>
      <Section n="8" title="Limitation of Liability">
        <p>To the maximum extent permitted by law, CAVI is not liable for indirect, incidental, or consequential damages, or for losses caused by market conditions, network failures, or events beyond our control.</p>
      </Section>
      <Section n="9" title="Changes to These Terms">
        <p>We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised terms.</p>
      </Section>
      <Section n="10" title="Contact">
        <p>Questions? Reach us at <a className="text-[#00d4a0]" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> or via WhatsApp / live chat on our homepage.</p>
      </Section>
    </LegalShell>
  );
}
