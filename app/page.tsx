"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import { Connection } from "@solana/web3.js";
import { QRCodeSVG } from "qrcode.react";

// --- CONFIGURATION ---
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const HOUSE_WALLET = "BM5ZNrB4a6ZFAHKSbUpctMS9TYSLNA9gbeFpxNksHDLP"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=f2f77e2b-2001-4ec5-a1c0-13b6b22b3a46";
const connection = new Connection(HELIUS_RPC, "confirmed");

export default function CuratedChillHouse() {
  const [credits, setCredits] = useState(0);
  const [hasPaid, setHasPaid] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [view, setView] = useState<"swipe" | "chat" | "upload" | "vault">("swipe");
  
  const [memes, setMemes] = useState<any[]>([]);
  const [userMemes, setUserMemes] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  
  const [uploadUrl, setUploadUrl] = useState("");
  const [creatorWallet, setCreatorWallet] = useState("");
  const [unclaimedBalance, setUnclaimedBalance] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [currentMemeIndex, setCurrentMemeIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem("chill_credits");
    if (saved && parseInt(saved) > 0) {
      setCredits(parseInt(saved));
      setHasPaid(true);
    }
    fetchData();
  }, []);

  useEffect(() => {
    sessionStorage.setItem("chill_credits", credits.toString());
    if (credits <= 0 && hasPaid) {
      setHasPaid(false);
      sessionStorage.removeItem("chill_credits");
    }
  }, [credits, hasPaid]);

  const fetchData = async () => {
    const { data: memeData } = await supabase.from("memes").select("*").order("created_at", { ascending: false });
    if (memeData) setMemes(memeData);
    const { data: msgData } = await supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(50);
    if (msgData) setMessages(msgData);
  };

  useEffect(() => {
    const msgChannel = supabase.channel("chat").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, 
    (p) => setMessages(prev => [...prev, p.new].slice(-50))).subscribe();
    return () => { supabase.removeChannel(msgChannel); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, view]);

  const accessVault = async () => {
    const wallet = prompt("Confirm Wallet for Vault Access:");
    if (!wallet) return;
    const { data: bData } = await supabase.from("creator_balances").select("unclaimed_credits").eq("address", wallet).maybeSingle();
    const { data: uData } = await supabase.from("memes").select("*").eq("creator_address", wallet);
    setUnclaimedBalance(bData?.unclaimed_credits || 0);
    setCreatorWallet(wallet);
    setUserMemes(uData || []);
    setView("vault");
  };

  const requestPayout = async () => {
    if (unclaimedBalance < 50) return alert("Min 50 credits required.");
    setIsClaiming(true);
    const payoutAmount = unclaimedBalance - 5;
    try {
        await supabase.from("payout_requests").insert([{ address: creatorWallet, amount: payoutAmount }]);
        await supabase.from("creator_balances").update({ unclaimed_credits: 0 }).eq("address", creatorWallet);
        setUnclaimedBalance(0);
        alert(`Request for ${payoutAmount} tokens sent!`);
        setView("swipe");
    } catch (err) { alert("Error processing payout."); } finally { setIsClaiming(false); }
  };

  const handleVote = async (direction: "left" | "right") => {
    const currentMeme = memes[currentMemeIndex];
    if (direction === "right") {
      if (credits <= 0) return;
      setCredits(prev => prev - 1);
      if (currentMeme?.creator_address) {
        await supabase.rpc('increment_creator_balance', { creator_addr: currentMeme.creator_address });
      }
    }
    setCurrentMemeIndex(prev => (prev + 1) % memes.length);
  };

  const sendMsg = async () => {
    if (credits <= 0 || !input.trim()) return;
    setCredits(prev => prev - 1);
    await supabase.from("messages").insert([{ text: input }]);
    setInput("");
  };

  const handleUpload = async () => {
    if (credits < 10) return alert("10 Credits Required.");
    if (!uploadUrl || !creatorWallet) return alert("Fill all fields.");
    setIsUploading(true);
    const { error } = await supabase.from("memes").insert([{ url: uploadUrl, creator_address: creatorWallet }]);
    if (!error) {
      setCredits(prev => prev - 10);
      setUploadUrl("");
      setView("swipe");
      fetchData();
    }
    setIsUploading(false);
  };

  const validatePayment = async () => {
    const sig = prompt("Paste Signature:");
    if (!sig) return;
    setIsVerifying(true);
    try {
      const status = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
      if (status?.value?.confirmationStatus === "confirmed" || status?.value?.confirmationStatus === "finalized") {
        setCredits(100); setHasPaid(true);
      } else { alert("Syncing..."); }
    } catch (e) { alert("RPC Error."); } finally { setIsVerifying(false); }
  };

  if (!hasPaid) {
    return (
      <div className="h-screen bg-[#F5F5DC] flex flex-col items-center justify-center p-8 text-center font-sans">
        <h1 className="text-2xl font-serif text-orange-950 mb-8 uppercase tracking-widest font-black">CuratedChill.house</h1>
        <div className="bg-white p-6 rounded-[40px] shadow-2xl mb-8 border-4 border-white">
          <QRCodeSVG value={HOUSE_WALLET} size={180} fgColor="#431407" />
        </div>
        <button onClick={validatePayment} className="bg-[#431407] text-[#F5F5DC] px-10 py-4 rounded-full font-bold shadow-lg text-xs tracking-widest uppercase">ENTER HOUSE (100 $CHILL)</button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#F5F5DC] flex flex-col items-center overflow-hidden font-sans text-[#431407]">
      <div className="w-full px-8 py-4 flex justify-between items-center bg-white/30 border-b border-[#431407]/10 backdrop-blur-sm">
        <span className="font-serif italic text-lg cursor-pointer font-black" onClick={() => setView("swipe")}>CuratedChill</span>
        <div className="flex items-center gap-4">
            <button onClick={accessVault} className="text-[10px] uppercase font-black opacity-40 hover:opacity-100 tracking-widest">Vault</button>
            <div className="bg-[#431407] text-[#F5F5DC] px-4 py-1 rounded-full text-xs font-black">{credits} CR</div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-md relative flex flex-col items-center justify-center p-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {view === "swipe" && (
            <motion.div key="swipe" className="relative w-full aspect-[3/4] bg-white rounded-[3rem] shadow-2xl overflow-hidden border-[12px] border-white">
              <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(e, info) => {
                if (info.offset.x > 80) handleVote("right");
                if (info.offset.x < -80) handleVote("left");
              }} className="absolute inset-0">
                {memes.length > 0 ? (
                  <img src={memes[currentMemeIndex]?.url} className="w-full h-full object-cover pointer-events-none select-none" />
                ) : ( <div className="flex h-full items-center justify-center opacity-30 italic font-serif">Loading Archive...</div> )}
              </motion.div>
            </motion.div>
          )}

          {view === "chat" && (
            <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full flex flex-col bg-white/60 rounded-[3rem] p-6 shadow-xl border border-white/50 backdrop-blur-md">
               <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-hide">
                {messages.map(m => (
                    <div key={m.id} className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-[#431407]/5">
                        <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                        <p className="text-[8px] opacity-30 mt-2 uppercase font-black tracking-widest">{new Date(m.created_at).toLocaleTimeString()}</p>
                    </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 bg-white rounded-2xl px-5 py-4 outline-none text-sm shadow-md border border-[#431407]/10 placeholder:text-[#431407]/30" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMsg()} placeholder="Lounge Tax: 1 CR"/>
                <button onClick={sendMsg} className="bg-[#431407] text-white px-4 rounded-2xl font-black text-[10px] uppercase tracking-widest">Send</button>
              </div>
            </motion.div>
          )}

          {view === "upload" && (
            <motion.div key="upload" className="w-full bg-white rounded-[3rem] p-10 shadow-2xl border-4 border-white">
              <h2 className="font-serif font-black text-center mb-8 uppercase tracking-widest text-xl">Archive Submission</h2>
              <div className="space-y-6">
                <div>
                    <label className="text-[10px] uppercase font-black opacity-40 ml-2 tracking-widest">Image URL</label>
                    <input className="w-full bg-[#F5F5DC]/50 rounded-2xl px-5 py-4 outline-none text-sm border border-[#431407]/10 focus:border-[#431407] text-[#431407] font-medium" placeholder="https://..." value={uploadUrl} onChange={e => setUploadUrl(e.target.value)}/>
                </div>
                <div>
                    <label className="text-[10px] uppercase font-black opacity-40 ml-2 tracking-widest">Payout Wallet</label>
                    <input className="w-full bg-[#F5F5DC]/50 rounded-2xl px-5 py-4 outline-none text-sm border border-[#431407]/10 focus:border-[#431407] text-[#431407] font-medium" placeholder="Solana Address" value={creatorWallet} onChange={e => setCreatorWallet(e.target.value)}/>
                </div>
                <button disabled={isUploading} onClick={handleUpload} className="w-full bg-[#431407] text-[#F5F5DC] py-5 rounded-full font-black uppercase tracking-widest text-[11px] shadow-lg active:scale-95 transition-all">Post Meme (10 CR)</button>
              </div>
            </motion.div>
          )}

          {view === "vault" && (
            <div className="w-full h-full flex flex-col bg-white rounded-[3rem] p-8 shadow-2xl border-4 border-white">
                <div className="text-center mb-6">
                    <h2 className="font-serif font-black text-xl tracking-widest uppercase mb-4">Your Vault</h2>
                    <div className="p-8 bg-[#F5F5DC] rounded-[2.5rem] border border-[#431407]/10 shadow-inner">
                        <span className="text-5xl font-black">{unclaimedBalance}</span>
                        <p className="text-[10px] opacity-40 uppercase mt-2 tracking-widest font-black">Credits Earned</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto mb-6 pr-2">
                    <div className="grid grid-cols-2 gap-3">
                        {userMemes.map((m, i) => (
                            <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-[#431407]/10 shadow-sm"><img src={m.url} className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all" /></div>
                        ))}
                    </div>
                </div>
                <button disabled={isClaiming || unclaimedBalance < 50} onClick={requestPayout} className="w-full bg-[#431407] text-white py-5 rounded-full font-black shadow-lg uppercase text-[10px] tracking-widest disabled:opacity-30">
                  {isClaiming ? "Wait..." : `Claim ${unclaimedBalance > 5 ? unclaimedBalance - 5 : 0} Tokens`}
                </button>
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full pb-10 flex justify-center gap-14 bg-[#F5F5DC]">
        <button onClick={() => setView("swipe")} className={`text-2xl transition-all ${view === 'swipe' ? 'scale-125 opacity-100' : 'opacity-20'}`}>🗝️</button>
        <button onClick={() => setView("chat")} className={`text-2xl transition-all ${view === 'chat' ? 'scale-125 opacity-100' : 'opacity-20'}`}>💬</button>
        <button onClick={() => setView("upload")} className={`text-2xl transition-all ${view === 'upload' ? 'scale-125 opacity-100' : 'opacity-20'}`}>📤</button>
      </div>
    </div>
  );
}
