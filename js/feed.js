import { $, chrome, api, clipHtml, wireClips } from "./ui.js";

chrome("feed");

let oldest = Infinity;
let loading = false;
let done = false;
const seen = new Set();

async function more() {
  if (loading || done) return;
  loading = true;
  const list = await api(`/api/videos?limit=12${Number.isFinite(oldest) ? `&before=${oldest}` : ""}`);
  loading = false;
  const end = $("end");
  if (!Array.isArray(list)) {
    end.hidden = false;
    end.textContent = "The service is not answering right now. Refresh in a minute.";
    return;
  }
  const fresh = list.filter((v) => !seen.has(`${v.token}-${v.id}`));
  fresh.forEach((v) => seen.add(`${v.token}-${v.id}`));
  if (fresh.length) {
    oldest = Math.min(...fresh.map((v) => v.at));
    const holder = document.createElement("div");
    holder.innerHTML = fresh.map((v) => clipHtml(v)).join("");
    const cards = [...holder.children];
    cards.forEach((c) => $("reel").appendChild(c));
    wireClips($("reel"));
  }
  if (list.length < 12) {
    done = true;
    end.hidden = false;
    end.innerHTML = seen.size
      ? "That's every video so far."
      : `No videos yet. The first one appears when a launcher burns for it. <a href="launch.html" style="color:var(--accent-ink);font-weight:600;text-decoration:none">Launch a persona →</a>`;
  }
}

// Load the next page a screen before the end.
const sentinel = $("more");
new IntersectionObserver((e) => e[0].isIntersecting && more(), { rootMargin: "800px" }).observe(sentinel);
await more();
