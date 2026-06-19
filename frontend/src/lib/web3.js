// Web3 wallet detection (EIP-6963), signing, and client-side wallet generation.

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58encode(bytes) {
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let str = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += "1";
  for (let i = digits.length - 1; i >= 0; i--) str += B58[digits[i]];
  return str;
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(h);
}

// Generates an address + private key in the browser. The private key is the
// only secret; it is sent ONCE to the backend and never shown to the user again.
export async function generateWallet(network) {
  const pk = crypto.getRandomValues(new Uint8Array(32));
  const privateKey = toHex(pk);
  const hash = await sha256(pk);
  let address;
  if (network === "ETH" || network === "BNB") {
    address = "0x" + toHex(hash).slice(0, 40);
  } else if (network === "SOL") {
    address = base58encode(hash);
  } else {
    // TRC20
    address = "T" + base58encode(hash).slice(0, 33);
  }
  return { address, privateKey };
}

// EIP-6963 multi-wallet detection
export function detectEvmProviders(timeout = 400) {
  return new Promise((resolve) => {
    const found = [];
    const handler = (e) => {
      if (!found.some((p) => p.info.uuid === e.detail.info.uuid)) found.push(e.detail);
    };
    window.addEventListener("eip6963:announceProvider", handler);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handler);
      resolve(found);
    }, timeout);
  });
}

export async function connectEvm(rdnsHint) {
  const providers = await detectEvmProviders();
  let provider = null;
  if (providers.length) {
    if (rdnsHint) {
      const match = providers.find((p) => (p.info.rdns || "").toLowerCase().includes(rdnsHint));
      provider = match ? match.provider : providers[0].provider;
    } else {
      provider = providers[0].provider;
    }
  } else if (window.ethereum) {
    provider = window.ethereum;
  }
  if (!provider) throw new Error("No EVM wallet detected. Install MetaMask or Coinbase Wallet.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!accounts || !accounts.length) throw new Error("No account returned by wallet");
  return { address: accounts[0], provider };
}

export async function signMessageEvm(provider, message, address) {
  return provider.request({ method: "personal_sign", params: [message, address] });
}

export async function connectSolana() {
  const provider = window.solana || (window.phantom && window.phantom.solana);
  if (!provider) throw new Error("Phantom wallet not detected. Install Phantom.");
  const resp = await provider.connect();
  return { address: resp.publicKey.toString(), provider };
}

export async function signMessageSolana(provider, message) {
  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, "utf8");
  const sig = signed.signature || signed;
  return base58encode(sig);
}

export function detectedWallets() {
  return {
    metamask: typeof window !== "undefined" && (!!window.ethereum?.isMetaMask || !!window.ethereum),
    phantom: typeof window !== "undefined" && !!(window.solana?.isPhantom || window.phantom?.solana),
    coinbase: typeof window !== "undefined" && !!window.ethereum?.isCoinbaseWallet,
  };
}
