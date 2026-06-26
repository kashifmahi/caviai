import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { mainnet, bsc, solana } from "@reown/appkit/networks";

const projectId = process.env.REACT_APP_REOWN_PROJECT_ID;

export const networks = [mainnet, bsc, solana];

export const wagmiAdapter = new WagmiAdapter({
  networks: [mainnet, bsc],
  projectId,
  ssr: false,
});

const solanaAdapter = new SolanaAdapter();

const metadata = {
  name: "CAVI",
  description: "Multi-chain crypto investment platform — deposit-only ROI.",
  url: typeof window !== "undefined" ? window.location.origin : "https://cavi.solutions",
  icons: ["https://cavi.solutions/logo.png"],
};

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks,
  projectId,
  metadata,
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#6c63ff",
    "--w3m-color-mix": "#05080f",
    "--w3m-color-mix-strength": 25,
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
});

export { projectId };
