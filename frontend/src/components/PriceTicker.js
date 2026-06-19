import React, { useEffect, useState } from "react";
import Marquee from "react-fast-marquee";
import api from "@/lib/api";

export default function PriceTicker() {
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get("/prices");
        if (active) setPrices(data.prices);
      } catch (e) {}
    };
    load();
    const t = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  if (!prices.length) return null;

  return (
    <div
      className="border-y border-white/5 bg-[#0a0f1a]/70 py-3"
      data-testid="price-ticker"
    >
      <Marquee speed={32} gradient={false} pauseOnHover>
        {prices.concat(prices).map((p, i) => {
          const up = p.change24h >= 0;
          return (
            <div key={i} className="flex items-center gap-3 mx-8 ff-mono text-sm">
              <span className="text-white/50">{p.symbol}/USD</span>
              <span className="text-white font-medium">
                ${p.price >= 1 ? p.price.toLocaleString() : p.price}
              </span>
              <span style={{ color: up ? "#00d4a0" : "#ff4757" }}>
                {up ? "▲" : "▼"} {Math.abs(p.change24h).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </Marquee>
    </div>
  );
}
