import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  connectEvm,
  connectSolana,
  signMessageEvm,
  signMessageSolana,
} from "@/lib/web3";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [loading, setLoading] = useState(true);

  const setSession = (data) => {
    localStorage.setItem("cavi_token", data.token);
    setUser(data.user);
  };

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("cavi_token");
    if (!token) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setFinancials(data.financials);
    } catch (e) {
      localStorage.removeItem("cavi_token");
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setSession(data);
    await refresh();
  };

  const register = async (username, email, password) => {
    const { data } = await api.post("/auth/register", { username, email, password });
    setSession(data);
    await refresh();
  };

  const walletAuth = async (chain, rdnsHint) => {
    let address, provider, signature;
    if (chain === "evm") {
      const c = await connectEvm(rdnsHint);
      address = c.address;
      provider = c.provider;
    } else {
      const c = await connectSolana();
      address = c.address;
      provider = c.provider;
    }
    const { data: nonceData } = await api.post("/auth/wallet-nonce", { address, chain });
    const message = nonceData.message;
    if (chain === "evm") signature = await signMessageEvm(provider, message, address);
    else signature = await signMessageSolana(provider, message);
    const { data } = await api.post("/auth/wallet-login", { address, message, signature, chain });
    setSession(data);
    await refresh();
  };

  const logout = () => {
    localStorage.removeItem("cavi_token");
    setUser(false);
    setFinancials(null);
  };

  const updateUsername = async (username) => {
    const { data } = await api.patch("/auth/update-username", { username });
    setUser(data.user);
  };

  return (
    <AuthContext.Provider
      value={{ user, financials, loading, login, register, walletAuth, logout, refresh, updateUsername }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
