import React from "react";
import { Link } from "react-router-dom";
import { Mail, MessageCircle } from "lucide-react";
import { WHATSAPP_URL, WHATSAPP_DISPLAY, SUPPORT_EMAIL } from "@/lib/contact";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/10 bg-[#070b14] relative z-10" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-6 py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg" style={{ background: "linear-gradient(135deg,#00d4a0,#6c63ff)" }} />
            <span className="ff-head font-bold text-lg text-white">CAVI</span>
          </div>
          <p className="text-white/45 text-sm mt-3 max-w-sm leading-relaxed">
            Multi-chain validator-node staking across Ethereum, Solana, BNB Chain and TRON — self-custodied wallets, daily rewards, one terminal.
          </p>
        </div>

        <div>
          <div className="overline text-white/40 mb-4">Company</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link to="/terms" className="text-white/60 hover:text-white transition-colors" data-testid="footer-terms">Terms &amp; Conditions</Link></li>
            <li><Link to="/privacy" className="text-white/60 hover:text-white transition-colors" data-testid="footer-privacy">Privacy Policy</Link></li>
            <li><a href="/#how" className="text-white/60 hover:text-white transition-colors">How it works</a></li>
          </ul>
        </div>

        <div>
          <div className="overline text-white/40 mb-4">Support</div>
          <ul className="space-y-3 text-sm">
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white/60 hover:text-white transition-colors inline-flex items-center gap-2" data-testid="footer-email">
                <Mail className="w-4 h-4 text-[#6c63ff]" /> {SUPPORT_EMAIL}
              </a>
            </li>
            <li>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors inline-flex items-center gap-2" data-testid="footer-whatsapp">
                <MessageCircle className="w-4 h-4 text-[#25D366]" /> {WHATSAPP_DISPLAY}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/35 text-xs">© {year} CAVI. All rights reserved.</p>
          <p className="text-white/30 text-[11px] max-w-xl text-center sm:text-right">
            Crypto staking involves risk. Returns are estimates and not guaranteed. Nothing here is financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
