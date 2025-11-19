
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

/**
 * Multi-agent (Six Thinking Hats) + external image/video agent calls
 *
 * Requirements:
 *  - TailwindCSS for styling (classes used)
 *  - Replace IMAGE_API_BASE and VIDEO_API_BASE if needed
 */

/* ---------------- Types ---------------- */
type MsgBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video"; src: string };

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  hat?: HatType | null; // which hat produced this assistant message (null for system/multi)
  content: MsgBlock[]; // ALWAYS an array
}

type HatType = "white" | "black" | "blue" | "red" | "yellow" | "green";

/* ---------------- Config / Endpoints ---------------- */
const IMAGE_API_BASE = "api/endpoint/01"; // POST /generate (form: prompt, num_steps, guidance, optional file)
const VIDEO_API_BASE = "api/endpoint/02"; // POST /generate_video (form: file, prompt, num_frames, num_inference_steps, fps)
const DEFAULT_CHAT_HEADING = "Fantastic SIX multiple agents (+ image + video)";

/* ---------------- Prompts & Styles ---------------- */
// const HAT_SYSTEM_PROMPTS: Record<HatType, string> = {
//   white: "You are the WHITE hat. Focus ONLY on facts, data, verified info. No opinions.",
//   black: "You are the BLACK hat. Focus on caution, criticism, risk, weaknesses, potential failures.",
//   blue: "You are the BLUE hat. Provide overview, organization, management, control, and planning.",
//   red: "You are the RED hat. Express emotions, gut feelings, intuition without justification.",
//   yellow: "You are the YELLOW hat. Highlight benefits, positives, value, bright possibilities.",
//   green: "You are the GREEN hat. Generate new ideas, alternatives, creativity, innovation.",
// };

const HAT_STYLE: Record<HatType, string> = {
  white: "bg-white border border-gray-300 text-gray-900",
  black: "bg-black text-white",
  blue: "bg-blue-50 text-blue-900",
  red: "bg-red-50 text-red-900",
  yellow: "bg-yellow-50 text-yellow-900",
  green: "bg-green-50 text-green-900",
};

/* ---------------- Utility: ID ---------------- */
const mkId = (pref = "") => `${pref}${Date.now()}${Math.floor(Math.random() * 9999)}`;

/* ---------------- Frontend "agent" logic (simple deterministic helpers) ----------------
   These are intentionally simple: they transform the user's cleaned text into a hat-style response.
   You can replace or expand them later with more advanced logic.
*/
function hatReply(hat: HatType, text: string): string {
  const trimmed = text.trim();
  switch (hat) {
    case "white":
      // Return factual/taken-as-is answer (echo plus "facts:")
      return trimmed
        ? `Facts / data related to your prompt:\n\n- ${trimmed}\n\n(As an assistant, I present what is explicit or verifiable.)`
        : "Please provide a prompt for factual analysis.";
    case "black":
      return trimmed
        ? `Risks & cautions:\n\n- Potential pitfalls with "${trimmed}" might include ...\n- Consider fallback plans and testing.`
        : "Please provide a prompt to analyze risk.";
    case "blue":
      return trimmed
        ? `Plan / structure:\n\n1. Define the objective for "${trimmed}".\n2. Assign steps and deadlines.\n3. Monitor and review progress.`
        : "Provide a prompt to produce a plan.";
    case "red":
      return trimmed
        ? `Emotional response / intuition:\n\nI feel that "${trimmed}" might be exciting and a bit risky — there's a gut-level concern about ...`
        : "Provide a prompt to express an intuition.";
    case "yellow":
      return trimmed
        ? `Benefits and positives:\n\n- "${trimmed}" could bring advantages such as increased engagement, novelty, and potential ROI.`
        : "Provide a prompt to highlight positives.";
    case "green":
      return trimmed
        ? `Creative ideas and alternatives:\n\n- Try variant A: ${trimmed} + twist.\n- Try variant B: combine with something unexpected.`
        : "Provide a prompt to generate creative ideas.";
    default:
      return "No hat matched.";
  }
}

/* ---------------- Tag extraction helpers ---------------- */
const extractHatTag = (text: string): string | null => {
  const m = text.match(/^@(\w+)/i);
  if (!m) return null;
  return m[1].toLowerCase();
};
const stripHatTag = (text: string) => text.replace(/^@\w+\s*/, "");

/* ---------------- React component ---------------- */
export default function App(): React.JSX.Element {
  /* Chat */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  /* Drag / upload (for calling image/video APIs) */
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  /* Settings */
  const [showSettings, setShowSettings] = useState(false);
  const [imageApiBase, setImageApiBase] = useState(IMAGE_API_BASE);
  const [videoApiBase, setVideoApiBase] = useState(VIDEO_API_BASE);
  const [imgNumSteps, setImgNumSteps] = useState(8);
  const [imgGuidance, setImgGuidance] = useState(2.5);
  const [vidNumFrames, setVidNumFrames] = useState(25);
  const [vidNumSteps, setVidNumSteps] = useState(15);
  const [vidFps, setVidFps] = useState(24);

  /* refs for scroll */
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollToBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  /* Drag & drop handlers */
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = (file: File) => {
    // Accept image files for image/video endpoints
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }
    setUploadFile(file);
    const url = URL.createObjectURL(file);
    setUploadPreview(url);
  };

  /* ---------------- Core send flow (frontend agents) ---------------- */
  const sendMessage = async () => {
    const raw = input.trim();
    if (!raw && !uploadFile) return;

    const tag = extractHatTag(raw); // e.g. 'black' or 'image' or 'video'
    const cleaned = stripHatTag(raw);

    // Push user message (normalize content as array)
    const userMsg: ChatMessage = {
      id: mkId("u_"),
      role: "user",
      content: [],
    };
    if (cleaned) userMsg.content.push({ type: "text", text: cleaned });
    if (uploadPreview) userMsg.content.push({ type: "image_url", image_url: { url: uploadPreview } });

    setMessages((p) => [...p, userMsg]);
    setInput("");
    setUploadFile(null);
    setUploadPreview(null);
    setLoading(true);

    // Special agent: @image
    if (tag === "image") {
      await handleImageAgent(cleaned, uploadFile);
      setLoading(false);
      scrollToBottom();
      return;
    }

    // Special agent: @video
    if (tag === "video") {
      await handleVideoAgent(cleaned, uploadFile);
      setLoading(false);
      scrollToBottom();
      return;
    }

    // Hat tag specified -> only that hat replies (client-side simulated)
    const hatNames: HatType[] = ["white", "black", "blue", "red", "yellow", "green"];

    if (tag && hatNames.includes(tag as HatType)) {
      const hat = tag as HatType;
      // produce assistant message from that hat
      const hatText = hatReply(hat, cleaned || "");
      const assistantMsg: ChatMessage = {
        id: mkId("a_"),
        role: "assistant",
        hat,
        content: [{ type: "text", text: hatText }],
      };
      setMessages((p) => [...p, assistantMsg]);
      setLoading(false);
      scrollToBottom();
      return;
    }

    // No tag => orchestrate: every hat replies separately (frontend simulation)
    // We add a short typing bubble then append all hats sequentially
    const placeholderId = mkId("a_placeholder_");
    setMessages((p) => [
      ...p,
      { id: placeholderId, role: "assistant", hat: null, content: [{ type: "text", text: "Thinking..." }] },
    ]);
    scrollToBottom();

    // produce each hat's reply with small delay for UX
    for (const hat of hatNames) {
      await new Promise((res) => setTimeout(res, 350)); // small delay to mimic thinking
      const hatText = hatReply(hat, cleaned || "");
      const hatMsg: ChatMessage = {
        id: mkId("a_"),
        role: "assistant",
        hat,
        content: [{ type: "text", text: hatText }],
      };
      setMessages((p) => {
        // remove placeholder if still present
        const withoutPlaceholder = p.filter((m) => m.id !== placeholderId);
        return [...withoutPlaceholder, hatMsg];
      });
      scrollToBottom();
    }

    setLoading(false);
    scrollToBottom();
  };

  /* ---------------- Image agent call ----------------
     Calls external image API via FormData:
     POST `${imageApiBase}/generate` with fields: prompt, num_steps, guidance
     If uploadFile present, append file under 'file' or 'image' depending on server.
  */
  const handleImageAgent = async (promptText: string, file?: File | null) => {
    // show generating bubble
    const genId = mkId("img_gen_");
    setMessages((p) => [
      ...p,
      { id: genId, role: "assistant", hat: "white" /* styling: use white? */, content: [{ type: "text", text: "🎨 Generating image..." }] },
    ]);
    scrollToBottom();

    try {
      const fd = new FormData();
      fd.append("prompt", promptText || "");
      fd.append("num_steps", String(imgNumSteps));
      fd.append("guidance", String(imgGuidance));
      if (file) fd.append("file", file);

      const res = await fetch(`${imageApiBase}/generate`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Image API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      // Expecting { image: "<base64...>" }
      if (!data || !data.image) {
        throw new Error("Image API returned empty response.");
      }
      const src = `data:image/png;base64,${data.image}`;

      // replace the generating bubble with an assistant image message
      setMessages((p) => {
        const withoutPlaceholder = p.filter((m) => m.id !== genId);
        const newMsg: ChatMessage = {
          id: mkId("img_"),
          role: "assistant",
          hat: "white",
          content: [
            { type: "text", text: "Here is your generated image:" },
            { type: "image_url", image_url: { url: src } },
          ],
        };
        return [...withoutPlaceholder, newMsg];
      });
    } catch (err: any) {
      setMessages((p) => {
        const withoutPlaceholder = p.filter((m) => !m.id.startsWith("img_gen_"));
        return [
          ...withoutPlaceholder,
          { id: mkId("img_err_"), role: "assistant", hat: "white", content: [{ type: "text", text: `❌ Image generation failed: ${err?.message || err}` }] },
        ];
      });
    }
  };

  /* ---------------- Video agent call ----------------
     Calls external video API via FormData:
     POST `${videoApiBase}/generate_video` with fields: file, prompt, num_frames, num_inference_steps, fps
     Expect response: { status: "success", video_base64, mime }
  */
  const handleVideoAgent = async (promptText: string, file?: File | null) => {
    // show generating bubble
    const genId = mkId("vid_gen_");
    setMessages((p) => [
      ...p,
      { id: genId, role: "assistant", hat: "blue", content: [{ type: "text", text: "🎬 Generating video..." }] },
    ]);
    scrollToBottom();

    try {
      if (!file) {
        // allow backend to generate from prompt-only if supported, else fail
        // Here we proceed but warn if backend requires file
      }
      const fd = new FormData();
      if (file) fd.append("file", file);
      fd.append("prompt", promptText || "");
      fd.append("num_frames", String(vidNumFrames));
      fd.append("num_inference_steps", String(vidNumSteps));
      fd.append("fps", String(vidFps));

      const res = await fetch(`${videoApiBase}/generate_video`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Video API error: ${res.status} ${text}`);
      }

      const data = await res.json();
      if (data.status === "success" && data.video_base64) {
        const videoSrc = `data:${data.mime};base64,${data.video_base64}`;
        setMessages((p) => {
          const withoutPlaceholder = p.filter((m) => m.id !== genId);
          const newMsg: ChatMessage = {
            id: mkId("vid_"),
            role: "assistant",
            hat: "blue",
            content: [{ type: "video", src: videoSrc }],
          };
          return [...withoutPlaceholder, newMsg];
        });
      } else {
        const msg = data.message || "Failed to generate video.";
        setMessages((p) => {
          const withoutPlaceholder = p.filter((m) => m.id !== genId);
          return [...withoutPlaceholder, { id: mkId("vid_err_"), role: "assistant", hat: "blue", content: [{ type: "text", text: `❌ ${msg}` }] }];
        });
      }
    } catch (err: any) {
      setMessages((p) => {
        const withoutPlaceholder = p.filter((m) => m.id !== genId);
        return [...withoutPlaceholder, { id: mkId("vid_err2_"), role: "assistant", hat: "blue", content: [{ type: "text", text: `❌ Video generation error: ${err?.message || err}` }] }];
      });
    }
  };

  /* ---------------- UI helpers ---------------- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) sendMessage();
    }
  };

  const removeUpload = () => {
    setUploadFile(null);
    setUploadPreview(null);
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Drag overlay */}
      {dragActive && (
        <div className="absolute inset-0 z-40 bg-black/40 flex items-center justify-center text-white text-2xl pointer-events-none">
          Drop image to upload
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{DEFAULT_CHAT_HEADING}</h1>
          <div className="text-xs text-gray-500">Use @image or @video or @white/@black/@green etc.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-sm"
          >
            {showSettings ? "Hide settings" : "Settings"}
          </button>
        </div>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="p-4 bg-white border-b space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label className="text-xs font-medium">Image API Base</label>
              <input type="text" value={imageApiBase} onChange={(e) => setImageApiBase(e.target.value)} className="p-2 border rounded" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium">Video API Base</label>
              <input type="text" value={videoApiBase} onChange={(e) => setVideoApiBase(e.target.value)} className="p-2 border rounded" />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium">Example</label>
              <div className="text-xs text-gray-600">Tag examples: <code>@image</code> <code>@video</code> <code>@black</code></div>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4 text-sm">
            <div>
              <label className="text-xs">Image Steps: {imgNumSteps}</label>
              <input type="range" min={4} max={100} value={imgNumSteps} onChange={(e) => setImgNumSteps(Number(e.target.value))} className="w-full accent-gray-600" />
            </div>
            <div>
              <label className="text-xs">Image Scale: {imgGuidance.toFixed(1)}</label>
              <input type="range" min={1} max={10} step={0.1} value={imgGuidance} onChange={(e) => setImgGuidance(Number(e.target.value))} className="w-full accent-gray-600" />
            </div>
            <div>
              <label className="text-xs">Video Frames: {vidNumFrames}</label>
              <input type="range" min={8} max={200} value={vidNumFrames} onChange={(e) => setVidNumFrames(Number(e.target.value))} className="w-full accent-gray-600" />
            </div>
            <div>
              <label className="text-xs">Video FPS: {vidFps}</label>
              <input type="range" min={8} max={60} value={vidFps} onChange={(e) => setVidFps(Number(e.target.value))} className="w-full accent-gray-600" />
            </div>
            <div>
              <label className="text-xs">Video Steps: {vidNumSteps}</label>
              <input type="range" min={4} max={200} value={vidNumSteps} onChange={(e) => setVidNumSteps(Number(e.target.value))} className="w-full accent-gray-600" />
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => {
          const align = m.role === "user" ? "justify-end" : "justify-start";
          const hatStyle = m.role === "assistant" && m.hat ? HAT_STYLE[m.hat] : "";
          return (
            <div key={m.id} className={`flex ${align}`}>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl shadow-sm whitespace-pre-wrap ${m.role === "user" ? "bg-gray-800 text-white" : hatStyle || "bg-white text-gray-900"}`}
              >
                {m.hat && m.role === "assistant" && (
                  <div className="text-xs opacity-60 mb-1">{m.hat.toUpperCase()}</div>
                )}

                {/* Render content array safely */}
                {m.content.map((blk, idx) => {
                  if (blk.type === "text") {
                    return (
                      <div key={idx} className="mb-2">
                        <ReactMarkdown>{blk.text}</ReactMarkdown>
                      </div>
                    );
                  }
                  if (blk.type === "image_url") {
                    return (
                      <div key={idx} className="mt-2">
                        <img src={blk.image_url.url} alt="img" className="rounded-lg max-w-full" />
                      </div>
                    );
                  }
                  if (blk.type === "video") {
                    return (
                      <div key={idx} className="mt-2">
                        <video src={blk.src} controls loop className="rounded-lg max-w-full" />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white p-3 rounded-2xl shadow max-w-[60%] animate-pulse">
              Generating...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input / Upload area */}
      <footer className="p-4 bg-white border-t">
        {uploadPreview && (
          <div className="flex items-center gap-3 mb-3">
            <img src={uploadPreview} alt="preview" className="h-16 rounded-lg object-cover border" />
            <div className="flex gap-2">
              <button onClick={() => removeUpload()} className="px-3 py-1 bg-red-100 text-red-700 rounded">Remove</button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type a message. Use @image, @video, or @white/@black/@green etc."
            className="flex-1 p-3 border rounded-lg resize-none focus:ring-2 focus:ring-indigo-200"
          />

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                className="hidden"
                id="file_input"
              />
              {/* <button
                onClick={() => document.getElementById("file_input")?.click()}
                className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                Upload
              </button> */}
            </label>

            <button
              onClick={() => sendMessage()}
              disabled={loading}
              className={`px-5 py-2 rounded-lg text-white font-medium ${
                loading ? "bg-gray-400 cursor-not-allowed" : "bg-gray-800 hover:bg-gray-900"
              }`}
            >
              Send
            </button>
          </div>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          Tip: Prefix a message with <code>@image</code> to generate images, <code>@video</code> to generate videos, or <code>@black</code> etc. to call a specific hat.
        </div>
      </footer>
    </div>
  );
}
