(() => {

  function forumRoleKey(profile = null) {
    return String(profile?.role || "").trim().toLowerCase();
  }

  function forumIsOwner(profile = null) {
    return forumRoleKey(profile) === "owner";
  }

  function forumIsPrivilegedPoster(profile = null) {
    const role = forumRoleKey(profile);
    return ["owner", "superadmin", "admin", "moderator", "moderador"].includes(role);
  }


  const state = {
    page: 0,
    pageSize: 10,
    loading: false,
    categories: [],
    currentPost: null,
    likedPosts: new Set(),
    likedComments: new Set(),
    replyingTo: null,
    myProfile: null,
    commentsById: new Map()
  };

  const FORUM_NAME = "Foro Work and Travel RD";
  const pdfSummaryStore = new Map();
  let pdfSummarySeq = 0;

  async function loadCategories() {
    if (!WT.canConnect) return [];
    const { data } = await WT.supabase
      .from("forum_categories")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    state.categories = data || [];

    const select = WT.qs("#forumCategory");
    if (select) {
      select.innerHTML = `<option value="">Todas</option>` + state.categories.map(c => `<option value="${c.id}">${WT.escapeHTML(c.name)}</option>`).join("");
    }

    const sidebar = WT.qs("#sidebarCategories");
    if (sidebar) {
      sidebar.innerHTML = state.categories.slice(0, 10).map(c => `<button class="sidebar-category-chip" type="button" data-sidebar-category="${c.id}">${WT.escapeHTML(c.name)}</button>`).join("") || `<span class="muted">Sin categorías</span>`;
    }

    return state.categories;
  }

  function updateLoadMoreButton({ loading = false, hasMore = true, empty = false } = {}) {
    const btn = WT.qs("#loadMorePosts");
    if (!btn) return;
    btn.disabled = loading || !hasMore;
    btn.classList.toggle("is-disabled", !hasMore);
    if (loading) btn.textContent = "Cargando...";
    else if (!hasMore) btn.textContent = empty ? "No hay publicaciones para mostrar" : "No hay más publicaciones";
    else btn.textContent = "Cargar más";
  }

  async function listPosts(reset = false) {
    if (!WT.canConnect || state.loading) return;
    state.loading = true;
    updateLoadMoreButton({ loading: true, hasMore: true });
    if (reset) state.page = 0;

    const root = WT.qs("#forumPosts");
    const search = WT.qs("#forumSearch")?.value?.trim() || "";
    const category = WT.qs("#forumCategory")?.value || "";
    const sort = WT.qs("#forumSort")?.value || "recent";

    state.myProfile = state.myProfile || await WT.getMyProfile().catch(() => null);
    const canSeePending = canManageForumComments();

    let q = WT.supabase
      .from("forum_posts")
      .select("*, forum_categories(name)")
      .or(canSeePending ? "status.is.null,status.eq.approved,status.eq.pending" : "status.is.null,status.eq.approved");

    if (category) q = q.eq("category_id", category);
    if (search) q = q.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    if (sort === "popular") q = q.order("likes_count", { ascending: false });
    else if (sort === "commented") q = q.order("comments_count", { ascending: false });
    else q = q.order("last_activity_at", { ascending: false });

    q = q.range(state.page * state.pageSize, state.page * state.pageSize + state.pageSize - 1);
    const { data, error } = await q;
    state.loading = false;

    if (error) {
      updateLoadMoreButton({ loading: false, hasMore: true });
      return WT.toast(error.message, "error", "No se pudo cargar el foro");
    }

    const rows = data || [];
    const posts = await WTContent.hydrateAuthors(rows);
    await hydrateLikedPosts(posts.map(p => p.id));
    const html = posts.map(renderPostCard).join("");

    if (root) {
      root.innerHTML = reset ? (html || `<div class="empty-state forum-empty-state" data-empty-state="forum-posts">No hay publicaciones.</div>`) : root.innerHTML + html;
      bindPublicProfileTriggers(root);
    }

    const hasMore = rows.length === state.pageSize;
    const empty = reset && rows.length === 0;
    updateLoadMoreButton({ loading: false, hasMore, empty });
    if (rows.length) state.page += 1;
  }

  function compactNumber(value) {
    const n = Number(value || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 ? 1 : 0).replace(".", ",") + " M";
    if (n >= 1000) return (n / 1000).toFixed(n % 1000 ? 1 : 0).replace(".", ",") + " mil";
    return String(n);
  }

  function postUrl(postId) {
    return `post.html?id=${encodeURIComponent(String(postId || ""))}`;
  }

  function shouldIgnoreCardOpen(target) {
    return !!target.closest('a, button, input, select, textarea, label, [role="button"], [data-open-public-profile], [data-open-image-viewer], .forum-attachment-gallery, .fa-post-card__actions');
  }

  const MENTION_LIMIT = 8;

  function normalizeMentionUsername(value = "") {
    return String(value || "")
      .replace(/^@+/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24);
  }

  function extractMentionUsernames(text = "") {
    const found = [];
    const seen = new Set();
    const re = /(^|[^\w])@([a-zA-Z0-9_]{3,24})\b/g;
    let match;
    while ((match = re.exec(String(text || ""))) && found.length < MENTION_LIMIT) {
      const username = normalizeMentionUsername(match[2]);
      if (!username || seen.has(username)) continue;
      seen.add(username);
      found.push(username);
    }
    return found;
  }

  function mentionProfilePayload(profile = {}) {
    return encodeURIComponent(JSON.stringify({
      id: profile.id || "",
      full_name: profile.full_name || profile.username || "Estudiante",
      username: profile.username || "",
      photo_url: profile.photo_url || "",
      role: profile.role || "user",
      badges: Array.isArray(profile.badges) ? profile.badges : [],
      bio: profile.bio || "",
      city: profile.city || "",
      sponsor: profile.sponsor || "",
      program_year: profile.program_year || ""
    }));
  }

  async function resolveMentionProfilesFromText(text = "") {
    const usernames = extractMentionUsernames(text);
    if (!usernames.length || !WT.supabase) return [];
    try {
      const { data, error } = await WT.supabase
        .from("public_profiles")
        .select("id,username,full_name,photo_url,role,bio,city,sponsor,program_year")
        .in("username", usernames);
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn("No se pudieron resolver menciones", error);
      return [];
    }
  }

  function renderMentions(text = "") {
    const safe = WT.escapeHTML(text || "");
    return safe.replace(/(^|[^\w])@([a-zA-Z0-9_]{3,24})\b/g, (match, prefix, rawUsername) => {
      const username = normalizeMentionUsername(rawUsername);
      if (!username) return match;
      return `${prefix}<button type="button" class="forum-mention-link" data-open-username-profile="${WT.escapeHTML(username)}">@${WT.escapeHTML(rawUsername)}</button>`;
    });
  }

  async function notifyMentionedUsers({ text = "", actorId = "", postId = "", type = "post" } = {}) {
    const profiles = await resolveMentionProfilesFromText(text);
    if (!profiles.length) return;

    const mentioned = profiles
      .filter(profile => profile?.id && String(profile.id) !== String(actorId))
      .filter((profile, index, arr) => arr.findIndex(p => p.id === profile.id) === index)
      .slice(0, MENTION_LIMIT);

    await Promise.allSettled(mentioned.map(profile => sendForumPush(profile.id, {
      title: type === "comment" ? "Te mencionaron en un comentario" : "Te mencionaron en una publicación",
      body: "Alguien te mencionó con tu @usuario.",
      message: "Alguien te mencionó con tu @usuario.",
      url: postId ? `post.html?id=${encodeURIComponent(postId)}` : "foro.html",
      type: "forum_mention",
      post_id: postId || null,
      postId: postId || null,
      actor_id: actorId || null,
      actorId: actorId || null,
      tag: `mention-${type}-${postId || Date.now()}-${profile.id}`
    })));
  }

  async function openUsernameProfile(username = "") {
    username = normalizeMentionUsername(username);
    if (!username || !WT.supabase) return;
    try {
      const { data, error } = await WT.supabase
        .from("public_profiles")
        .select("id,username,full_name,photo_url,role,bio,city,sponsor,program_year")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        WT.toast("No se encontró ese usuario.", "warning");
        return;
      }
      const payload = mentionProfilePayload(data);
      if (window.WTAuth?.showPublicProfileFromPayload) {
        window.WTAuth.showPublicProfileFromPayload(payload);
      } else {
        const btn = document.createElement("button");
        btn.dataset.openPublicProfile = payload;
        document.body.appendChild(btn);
        btn.click();
        btn.remove();
      }
    } catch (error) {
      WT.toast(error.message || "No se pudo abrir el perfil.", "error");
    }
  }

  function getMentionQuery(textarea) {
    const value = String(textarea?.value || "");
    const pos = textarea?.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const match = before.match(/(^|[\s([{"'¿¡.,;:])@([a-zA-Z0-9_]{0,24})$/);
    if (!match) return null;
    return {
      query: normalizeMentionUsername(match[2] || ""),
      start: pos - String(match[2] || "").length - 1,
      end: pos
    };
  }

  function ensureMentionSuggestBox(textarea) {
    let box = textarea?.parentElement?.querySelector(".forum-mention-suggest");
    if (!box && textarea?.parentElement) {
      box = document.createElement("div");
      box.className = "forum-mention-suggest";
      box.hidden = true;
      textarea.parentElement.appendChild(box);
    }
    return box;
  }

  function hideMentionSuggest(textarea) {
    const box = textarea?.parentElement?.querySelector(".forum-mention-suggest");
    if (box) {
      box.hidden = true;
      box.replaceChildren();
    }
  }

  function hideAllMentionSuggests(root = document) {
    root.querySelectorAll?.(".forum-mention-suggest").forEach(box => {
      box.hidden = true;
      box.replaceChildren();
    });
  }


  async function getMentionFriendSuggestions() {
    const user = await WT.getCurrentUser?.().catch(() => null);
    if (!WT.supabase || !user?.id) return [];
    try {
      // V4065: no usamos embedded foreign tables aquí porque Supabase puede marcar
      // la relación como ambigua al existir requester_id y receiver_id hacia user_profiles.
      // Primero buscamos los IDs de amistades aceptadas y luego cargamos perfiles públicos.
      const { data: rows, error } = await WT.supabase
        .from("user_friendships")
        .select("id,requester_id,receiver_id,status,accepted_at,updated_at,created_at")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("accepted_at", { ascending: false })
        .limit(24);
      if (error) throw error;

      const friendIds = [];
      const seenIds = new Set();
      (rows || []).forEach(row => {
        const friendId = String(row.requester_id) === String(user.id) ? row.receiver_id : row.requester_id;
        if (!friendId || seenIds.has(String(friendId))) return;
        seenIds.add(String(friendId));
        friendIds.push(friendId);
      });

      if (!friendIds.length) return [];

      const { data: profiles, error: profileError } = await WT.supabase
        .from("public_profiles")
        .select("id,username,full_name,photo_url,role")
        .in("id", friendIds)
        .not("username", "is", null);
      if (profileError) throw profileError;

      const order = new Map(friendIds.map((id, index) => [String(id), index]));
      return (profiles || [])
        .filter(p => p?.username)
        .sort((a, b) => (order.get(String(a.id)) ?? 999) - (order.get(String(b.id)) ?? 999));
    } catch (error) {
      console.warn("No se pudieron cargar amigos para menciones", error);
      return [];
    }
  }


  async function searchMentionUsers(query = "") {
    if (!WT.supabase) return [];
    query = normalizeMentionUsername(query);

    const currentProfile = state.myProfile || await WT.getMyProfile?.().catch(() => null);
    const role = String(currentProfile?.role || "user").toLowerCase();
    const canSearchBroad = ["owner", "superadmin", "admin"].includes(role);

    const normalizeCandidate = (user = {}) => ({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      photo_url: user.photo_url,
      role: user.role,
      score: Number(user.score || 0),
      reason: String(user.reason || "").trim()
    });

    // V4065: primero intenta usar la función RPC inteligente.
    // Si el SQL todavía no está instalado, cae al comportamiento anterior.
    try {
      const { data, error } = await WT.supabase.rpc("search_mention_candidates_v4065", {
        search_text: query,
        result_limit: canSearchBroad ? (query ? 20 : 30) : 10
      });
      if (error) throw error;
      const candidates = (data || []).map(normalizeCandidate).filter(u => u?.username);
      if (candidates.length) return candidates;

      // V4065: si la RPC está instalada pero devuelve vacío, no dejamos la lista muerta.
      // Con @ vacío o 1 letra, regresamos a la lógica local de amigos.
      // Con 2+ letras, abajo se usa la búsqueda limitada anterior como respaldo.
      if (canSearchBroad && !query) return [];
    } catch (error) {
      console.warn("RPC de menciones inteligentes no disponible; usando búsqueda local.", error);
    }

    // Fallback anterior/mejorado: mantiene la privacidad si el SQL no está listo
    // o si la RPC no encuentra relaciones para ese usuario.
    if (canSearchBroad) {
      try {
        let request = WT.supabase
          .from("public_profiles")
          .select("id,username,full_name,photo_url,role")
          .not("username", "is", null)
          .order("username", { ascending: true })
          .limit(query ? 20 : 30);

        if (query) request = request.or(`username.ilike.${query}%,full_name.ilike.%${query}%`);

        const { data, error } = await request;
        if (error) throw error;
        return (data || []).filter(u => u?.username).map(u => ({ ...u, reason: query ? "search" : "admin_search" }));
      } catch (error) {
        console.warn("No se pudieron buscar usuarios para mencionar", error);
        return [];
      }
    }

    const friends = (await getMentionFriendSuggestions()).map(u => ({ ...u, reason: "friend", score: 100 }));
    if (!query) return friends.slice(0, 12);

    const friendMatches = friends.filter(u => String(u.username || "").toLowerCase().startsWith(query));
    if (query.length < 2) return friendMatches.slice(0, 12);

    try {
      const { data, error } = await WT.supabase
        .from("public_profiles")
        .select("id,username,full_name,photo_url,role")
        .not("username", "is", null)
        .ilike("username", `${query}%`)
        .order("username", { ascending: true })
        .limit(10);
      if (error) throw error;

      const merged = [...friendMatches, ...(data || []).map(u => ({ ...u, reason: "search", score: 10 }))].filter(u => u?.username);
      const seen = new Set();
      return merged.filter(u => {
        const key = String(u.id || u.username);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 10);
    } catch (error) {
      console.warn("No se pudieron buscar usuarios para mencionar", error);
      return friendMatches.slice(0, 10);
    }
  }

  function mentionReasonLabel(reason = "") {
    const labels = {
      friend: "Amigo",
      commented_your_post: "Comentó tu publicación",
      you_replied: "Le respondiste",
      interaction: "Interacción",
      mentioned_you: "Te mencionó",
      you_mentioned: "Lo mencionaste",
      search: "Búsqueda",
      admin_search: "Búsqueda"
    };
    return labels[String(reason || "").trim()] || "";
  }


  function insertMention(textarea, username, range) {
    if (!textarea || !username || !range) return;
    const value = textarea.value || "";
    const before = value.slice(0, range.start);
    const after = value.slice(range.end);
    const insert = `@${normalizeMentionUsername(username)} `;
    textarea.value = `${before}${insert}${after}`;
    const nextPos = before.length + insert.length;
    textarea.focus();
    textarea.setSelectionRange(nextPos, nextPos);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    hideMentionSuggest(textarea);
  }

  function renderMentionSuggest(textarea, users = [], range = null) {
    const box = ensureMentionSuggestBox(textarea);
    if (!box) return;
    if (!users.length || !range) {
      hideMentionSuggest(textarea);
      return;
    }
    box.hidden = false;
    box.dataset.hasResults = users.length ? "1" : "0";
    box.innerHTML = users.length ? users.map(user => {
      const avatar = WT.escapeHTML(WT.sanitizeImageUrl(user.photo_url, "images/placeholder-avatar.png"));
      const name = WT.escapeHTML(user.full_name || user.username || "Usuario");
      const username = WT.escapeHTML(user.username || "");
      const reason = mentionReasonLabel(user.reason);
      return `<button type="button" class="forum-mention-option" data-mention-pick="${username}" data-mention-start="${range.start}" data-mention-end="${range.end}">
        <img src="${avatar}" alt="">
        <span class="forum-mention-option-text">
          <b>${name}</b>
          <small><span>@${username}</span>${reason ? `<em>${WT.escapeHTML(reason)}</em>` : ""}</small>
        </span>
      </button>`;
    }).join("") : `<div class="forum-mention-empty">No tienes amigos para sugerir. Escribe 2 letras para buscar.</div>`;
  }


  function bindMentionAutocomplete(textarea) {
    if (!textarea || textarea.dataset.mentionsBound === "1") return;
    textarea.dataset.mentionsBound = "1";
    let seq = 0;
    const update = async () => {
      const range = getMentionQuery(textarea);
      if (!range) return hideMentionSuggest(textarea);
      const currentSeq = ++seq;
      const users = await searchMentionUsers(range.query);
      if (currentSeq !== seq) return;
      renderMentionSuggest(textarea, users, range);
    };
    textarea.addEventListener("input", update);
    textarea.addEventListener("keyup", update);
    // No cerrar al perder foco: en móvil, ocultar el teclado dispara blur.
    // La lista debe quedarse visible para que el usuario pueda tocar una sugerencia.

    textarea.parentElement?.addEventListener("click", event => {
      const pick = event.target.closest("[data-mention-pick]");
      if (!pick) return;
      event.preventDefault();
      event.stopPropagation();
      insertMention(textarea, pick.dataset.mentionPick, {
        start: Number(pick.dataset.mentionStart || 0),
        end: Number(pick.dataset.mentionEnd || 0)
      });
    });
  }

  function bindMentionAutocompletesIn(root = document) {
    root.querySelectorAll?.('textarea[name="body"], #commentBody, .forum-textarea').forEach(textarea => bindMentionAutocomplete(textarea));
  }


  function formatForumDateShort(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const diff = Math.max(0, now.getTime() - date.getTime());
    const min = 60 * 1000;
    const hour = 60 * min;
    if (sameDay) {
      if (diff < hour) return `Hace ${Math.max(1, Math.floor(diff / min))} min`;
      return `Hace ${Math.max(1, Math.floor(diff / hour))} h`;
    }
    const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const base = `${date.getDate()} ${months[date.getMonth()]}`;
    return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
  }

  function authorPayloadAttr(author = {}) {
    const payload = encodeURIComponent(JSON.stringify({
      id: author.id || "",
      full_name: author.full_name || "Estudiante",
      photo_url: author.photo_url || "",
      role: author.role || "user",
      badges: Array.isArray(author.badges) ? author.badges : [],
      bio: author.bio || "",
      city: author.city || "",
      sponsor: author.sponsor || "",
      program_year: author.program_year || ""
    }));
    return payload;
  }

  function renderAuthorTrigger(author = {}, { compact = false } = {}) {
    const authorName = author.full_name || author.username || "Estudiante";
    const authorUsername = normalizeMentionUsername(author.username || authorName || "");
    const authorAvatar = WT.escapeHTML(WT.sanitizeImageUrl(author.photo_url, "images/placeholder-avatar.png"));
    const badges = WT.renderUserBadges(author.badges || []);
    const payload = authorPayloadAttr(author);
    if (compact) {
      return `<button class="forum-author-trigger is-compact" type="button" data-open-public-profile="${payload}" aria-label="Ver perfil de ${WT.escapeHTML(authorName)}">
        <img class="avatar forum-author-trigger-avatar reddit-avatar" src="${authorAvatar}" alt="Foto de ${WT.escapeHTML(authorName)}">
      </button>`;
    }
    return `<button class="forum-author-trigger" type="button" data-open-public-profile="${payload}" aria-label="Ver perfil de ${WT.escapeHTML(authorName)}">
      <img class="avatar forum-author-trigger-avatar" src="${authorAvatar}" alt="Foto de ${WT.escapeHTML(authorName)}">
      <span class="author-meta forum-author-trigger-meta">
        <strong>${WT.escapeHTML(authorName)} ${WT.renderRoleBadge(author.role || "user")}</strong>
        ${badges}
      </span>
    </button>`;
  }

  function bindPublicProfileTriggers(root = document) {
    if (!root || root.dataset.publicProfileBound === '1') return;
    root.dataset.publicProfileBound = '1';
    root.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-open-public-profile]');
      if (!trigger || !root.contains(trigger)) return;
      event.preventDefault();
      event.stopPropagation();
      let data = {};
      try { data = JSON.parse(decodeURIComponent(trigger.dataset.openPublicProfile || '')); } catch (_) { data = {}; }
      if (window.WTAuth?.showPublicProfileModal) window.WTAuth.showPublicProfileModal(data);
    });
  }

  function withTimeout(promise, ms, message = "La operación tardó demasiado.") {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function isProblematicMobileSafari() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
    return isIOS || isSafari;
  }

  function fileExtensionFromBlob(blob) {
    if (blob?.type === "image/webp") return "webp";
    if (blob?.type === "image/jpeg") return "jpg";
    if (blob?.type === "image/png") return "png";
    return "webp";
  }

  function imageToBitmapUrl(file, timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        reject(new Error("La imagen tardó demasiado en prepararse."));
      }, timeoutMs);
      img.onload = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ img, url });
      };
      img.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la imagen."));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type = "image/webp", quality = 0.84, timeoutMs = 9000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (blob) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(fallbackTimer);
        resolve(blob || null);
      };
      const tryDataURL = () => {
        if (done) return;
        try {
          const asDataURL = canvas.toDataURL(type, quality);
          const fallbackBlob = asDataURL.startsWith(`data:${type}`) ? dataURLToBlob(asDataURL) : null;
          finish(fallbackBlob);
        } catch (_) {
          finish(null);
        }
      };

      const timer = setTimeout(() => finish(null), timeoutMs);
      const fallbackTimer = setTimeout(tryDataURL, type === "image/webp" ? 1800 : 3500);

      try {
        if (canvas.toBlob) {
          canvas.toBlob((blob) => {
            if (blob && blob.type && String(blob.type).toLowerCase().includes(type.split("/")[1])) return finish(blob);
            if (blob && type !== "image/webp") return finish(blob);
            tryDataURL();
          }, type, quality);
        } else {
          tryDataURL();
        }
      } catch (_) {
        tryDataURL();
      }
    });
  }

  async function compressForumImage(file, { maxBytes = 8 * 1024 * 1024, use = "forum" } = {}) {
    if (!file || !file.size) throw new Error("No se recibió una imagen válida.");

    const settings = await WT.getImageCompressionSettings().catch(() => ({ enabled: true, required: false, maxUploadMb: Number(getForumLimits().IMAGE_ORIGINAL_MAX_MB || 6), finalMaxMb: Number(getForumLimits().IMAGE_FINAL_MAX_MB || 3) }));
    const limitMb = Number(settings.maxUploadMb || 8) || 8;
    const limitBytes = Math.max(1, limitMb) * 1024 * 1024;
    const allowedBytes = Math.min(maxBytes || limitBytes, limitBytes);

    if (file.size > allowedBytes) {
      throw new Error(`La imagen es muy pesada. Máximo permitido: ${Math.round(allowedBytes / 1024 / 1024)} MB.`);
    }

    // Si el administrador desactiva la compresión, el foro debe subir el archivo original.
    if (!settings.enabled) {
      return {
        blob: file,
        fileName: file.name || "image.jpg",
        extension: fileExtensionFromBlob(file),
        compressed: false,
        fallback: true,
        width: null,
        height: null,
        mime: file.type || "image/jpeg"
      };
    }

    if (!window.WTImageCompressor?.optimizeForUse) {
      if (settings.required) throw new Error("El compresor WebP no cargó. Actualiza la página y vuelve a intentarlo.");
      return {
        blob: file,
        fileName: file.name || "image.jpg",
        extension: fileExtensionFromBlob(file),
        compressed: false,
        fallback: true,
        width: null,
        height: null,
        mime: file.type || "image/jpeg"
      };
    }

    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) || matchMedia("(max-width: 820px)").matches;
    try {
      const optimized = await WTImageCompressor.optimizeForUse(file, use, {
        fallbackToOriginal: !settings.required,
        onlyIfSmaller: false,
        timeoutMs: mobile ? (use === "comment" ? 14000 : 16000) : (use === "comment" ? 30000 : 32000),
        force: true,
        requireWebP: !!settings.required,
        allowJpegFallback: !settings.required
      });

      const type = String(optimized?.blob?.type || optimized?.mime || "").toLowerCase();
      if (!optimized?.blob || (settings.required && (!optimized.compressed || optimized.fallback))) {
        throw new Error("No se pudo comprimir la imagen en este dispositivo.");
      }
      if (settings.required && type !== "image/webp") {
        throw new Error("El móvil devolvió JPEG/PNG. La subida fue bloqueada porque solo se permite WebP.");
      }
      return optimized;
    } catch (error) {
      if (settings.required) throw error;
      // Compresión activa pero no obligatoria: permitir original si el móvil falla.
      return {
        blob: file,
        fileName: file.name || "image.jpg",
        extension: fileExtensionFromBlob(file),
        compressed: false,
        fallback: true,
        width: null,
        height: null,
        mime: file.type || "image/jpeg"
      };
    }
  }

  function normalizeAttachments(item = {}) {
    const out = [];
    const add = (value) => {
      if (!value) return;

      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }

      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed || trimmed === "[]" || trimmed === "{}") return;

        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          try {
            add(JSON.parse(trimmed));
            return;
          } catch (_) {}
        }

        // Compatibilidad por si una versión vieja guardó varias URLs como texto.
        if (trimmed.includes(",") || trimmed.includes("|")) {
          trimmed.split(/[|,]/).map(v => v.trim()).filter(Boolean).forEach(add);
          return;
        }

        const url = WT.sanitizeImageUrl(trimmed, "");
        if (url) out.push({ url });
        return;
      }

      if (typeof value === "object") {
        const nested = value.attachments || value.images || value.items || value.files || value.media;
        if (nested) add(nested);

        const url = WT.sanitizeImageUrl(
          value.url || value.publicUrl || value.public_url || value.image_url || value.src || value.href || "",
          ""
        );
        if (url) out.push({ ...value, url });
      }
    };

    add(item.attachments);
    add(item.images);
    add(item.image_urls);
    add(item.media);
    add(item.files);
    add(item.image_url);

    const seen = new Set();
    return out.filter(a => {
      if (!a.url || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }


  function normalizePdfAttachments(item = {}) {
    const out = [];
    const add = value => {
      if (!value) return;
      if (typeof value === "string") {
        try { add(JSON.parse(value)); } catch (_) {}
        return;
      }
      if (Array.isArray(value)) return value.forEach(add);
      if (typeof value === "object") {
        const url = value.view_url || value.url || value.webViewLink || "";
        const mime = String(value.mime || value.type || "").toLowerCase();
        const name = value.name || value.file_name || "Documento PDF";
        if (url && (mime.includes("pdf") || /\.pdf(\?|#|$)/i.test(name) || value.drive_file_id)) {
          out.push({
            name,
            size: Number(value.size || value.bytes || 0) || 0,
            mime: value.mime || "application/pdf",
            drive_file_id: value.drive_file_id || value.fileId || value.file_id || "",
            view_url: url,
            created_at: value.created_at || "",
            provider: value.provider || "google_drive",
            drive_id: value.drive_id || value.driveId || value.drive || "",
            folder_id: value.folder_id || value.folderId || "",
            upload_url: value.upload_url || value.uploadUrl || "",
            delete_url: value.delete_url || value.deleteUrl || "",
            analysis_status: value.analysis_status || value.analysisStatus || value.summary_status || "pending",
            analysis: value.analysis || value.summary || null
          });
        }
      }
    };
    add(item.pdf_attachments);
    add(item.pdfs);
    return out.filter(p => p.view_url);
  }

  function formatBytes(bytes = 0) {
    const n = Number(bytes || 0);
    if (!n) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function renderPdfAttachments(item = {}) {
    const pdfs = normalizePdfAttachments(item);
    if (!pdfs.length) return "";
    return `<div class="forum-pdf-list">${pdfs.map(pdf => `
      <div class="forum-pdf-item">
        <a class="forum-pdf-attachment" href="${WT.escapeHTML(pdf.view_url)}" target="_blank" rel="noopener noreferrer">
          <span class="forum-pdf-meta">
            <strong>${WT.escapeHTML(pdf.name || "Documento PDF")}</strong>
            <small>${WT.escapeHTML(formatBytes(pdf.size) || "PDF")}</small>
          </span>
          <span class="forum-pdf-open">Abrir</span>
        </a>
        ${renderPdfSummary(pdf)}
      </div>`).join("")}</div>`;
  }

  function getPdfConfig() {
    return WT.cfg?.GOOGLE_DRIVE_PDF || {};
  }

  function getForumLimits() {
    return WT.cfg?.FORUM_LIMITS || {};
  }

  function normalizeCounterResult(data, fallbackCounter = "") {
    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload || typeof payload !== "object") return { allowed: true, counter: fallbackCounter };
    return payload;
  }

  async function reserveDailyLimit(counterName, incrementBy, maxAllowed, label = "uso diario") {
    const amount = Math.max(0, Number(incrementBy || 0));
    const max = Math.max(1, Number(maxAllowed || 0));
    if (!amount || !max || !WT.supabase?.rpc) return { allowed: true };
    try {
      const { data, error } = await WT.supabase.rpc("reserve_user_daily_limit", {
        counter_name: counterName,
        increment_by: amount,
        max_allowed: max
      });
      if (error) throw error;
      const result = normalizeCounterResult(data, counterName);
      if (result.allowed === false) {
        throw new Error(`Has alcanzado el límite diario de ${max} ${label}.`);
      }
      return result;
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("function") || msg.includes("schema cache") || msg.includes("not found")) {
        console.warn("Falta ejecutar el SQL de límites diarios:", error);
        return { allowed: true, missingSql: true };
      }
      throw error;
    }
  }


  async function checkDailyLimit(counterName, incrementBy, maxAllowed, label = "uso diario") {
    const amount = Math.max(0, Number(incrementBy || 0));
    const max = Math.max(1, Number(maxAllowed || 0));
    if (!amount || !max || !WT.supabase?.rpc) return { allowed: true };
    try {
      const { data, error } = await WT.supabase.rpc("check_user_daily_limit", {
        counter_name: counterName,
        increment_by: amount,
        max_allowed: max
      });
      if (error) throw error;
      const result = normalizeCounterResult(data, counterName);
      if (result.allowed === false) throw new Error(`Has alcanzado el límite diario de ${max} ${label}.`);
      return result;
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("function") || msg.includes("schema cache") || msg.includes("not found")) {
        console.warn("Falta ejecutar el SQL de verificación de límites diarios:", error);
        return { allowed: true, missingSql: true };
      }
      throw error;
    }
  }

  async function commitDailyLimit(counterName, incrementBy, maxAllowed, label = "uso diario") {
    const amount = Math.max(0, Number(incrementBy || 0));
    if (!amount) return { allowed: true };
    return reserveDailyLimit(counterName, amount, maxAllowed, label);
  }

  async function cleanupUploadedImages(images = []) {
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    if (!list.length || !WT.deleteR2ImagesFromRecords) return [];
    try {
      return await WT.deleteR2ImagesFromRecords([{ attachments: list, image_attachments: list }]);
    } catch (error) {
      console.warn("No se pudieron limpiar imágenes huérfanas de Cloudflare R2", error);
      return [];
    }
  }

  async function cleanupUploadedPdfs(pdfs = []) {
    const list = Array.isArray(pdfs) ? pdfs.filter(Boolean) : [];
    if (!list.length) return [];
    try {
      return await deleteGoogleDrivePdfsFromRecords([{ pdf_attachments: list }]);
    } catch (error) {
      console.warn("No se pudieron limpiar PDFs huérfanos de Google Drive", error);
      return [];
    }
  }

  async function cleanupUploadedForumAssets(images = [], pdfs = []) {
    await Promise.allSettled([cleanupUploadedImages(images), cleanupUploadedPdfs(pdfs)]);
  }

  async function getCurrentForumBlockStatus(userId = "") {
    if (!userId || !WT.supabase?.rpc) return { blocked: false };
    try {
      const { data, error } = await WT.supabase.rpc("get_forum_account_status", { target_user_id: userId });
      if (error) throw error;
      return normalizeCounterResult(data, "account_status");
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("function") || msg.includes("schema cache") || msg.includes("not found")) {
        const profile = await WT.getMyProfile?.().catch(() => null);
        return { blocked: String(profile?.status || "active").toLowerCase() === "blocked", reason: profile?.block_reason || "" };
      }
      console.warn("No se pudo verificar el estado de bloqueo", error);
      return { blocked: false };
    }
  }

  async function ensureUserCanUseForum(userId = "") {
    const status = await getCurrentForumBlockStatus(userId);
    if (status?.blocked || String(status?.status || "").toLowerCase() === "blocked") {
      const reason = status.reason || status.block_reason || "Tu cuenta está bloqueada para usar el foro.";
      throw new Error(reason);
    }
    return true;
  }

  const ROLE_RANKS = { user: 0, moderator: 1, moderador: 1, admin: 2, superadmin: 3, owner: 4 };
  function roleRank(role = "user") { return ROLE_RANKS[String(role || "user").toLowerCase()] ?? 0; }
  function isOwnerProfile(profile = {}) { return String(profile?.role || "").toLowerCase() === "owner"; }
  function isWithinMinutes(dateValue, minutes = 5) { const time = new Date(dateValue || 0).getTime(); return !!time && Date.now() - time <= minutes * 60 * 1000; }
  function isWithinHours(dateValue, hours = 1) { const time = new Date(dateValue || 0).getTime(); return !!time && Date.now() - time <= hours * 60 * 60 * 1000; }
  function moderationDeleteHoursForRole(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "owner") return Infinity;
    if (r === "superadmin") return 48;
    if (r === "admin") return 24;
    if (r === "moderator" || r === "moderador") return 5;
    return 0;
  }
  function isWithinModerationDeleteWindow(dateValue, role = "user") {
    const hours = moderationDeleteHoursForRole(role);
    if (hours === Infinity) return true;
    return hours > 0 && isWithinHours(dateValue, hours);
  }
  function canManageTargetRole(targetRole = "user") {
    const myRole = String(state.myProfile?.role || "user").toLowerCase();
    const target = String(targetRole || "user").toLowerCase();
    if (myRole === "owner") return true;
    if (target === "owner") return false;
    return roleRank(myRole) > roleRank(target);
  }
  function canDeleteOwnForumPost(post = {}) { return String(state.myProfile?.id || "") === String(post.author_id || "") && (isOwnerProfile(state.myProfile) || isWithinMinutes(post.created_at, 5)); }
  function canDeleteForumContent(item = {}, author = {}) { if (!item?.id) return false; if (String(state.myProfile?.id || "") === String(item.author_id || "")) return isOwnerProfile(state.myProfile) || isWithinMinutes(item.created_at, 5); const myRole = String(state.myProfile?.role || "user").toLowerCase(); return canManageForumComments() && canManageTargetRole(author?.role || "user") && isWithinModerationDeleteWindow(item.created_at, myRole); }
  function canDeleteForumPost(post = {}, author = {}) { return canDeleteForumContent(post, author); }

  // WTRD v3951: moderación ajustada; permite joder/bellaco, agrega ñema y vuelve a bloquear culo/toto/cuero directos.
  const FORUM_BANNED_TERMS = [
      "singar",
      "singando",
      "singándome",
      "singándote",
      "singándola",
      "singándolo",
      "singándose",
      "singándosela",
      "singándoselo",
      "singame",
      "síngame",
      "singamelo",
      "singame eso",
      "singao",
      "singá",
      "singada",
      "singadera",
      "singaíto",
      "singaíta",
      "singón",
      "singona",
      "singo",
      "singué",
      "singues",
      "singuen",
      "me singo",
      "te singo",
      "se singa",
      "me singué",
      "que te singuen",
      "que te singen",
      "la singa",
      "el singo",
      "mamabicho",
      "mamábicho",
      "mama bicho",
      "mmg",
      "m m g",
      "m.m.g",
      "m-m-g",
      "mamaguevo",
      "mamagüevo",
      "mama guevo",
      "mama güevo",
      "mamahuevo",
      "mama huevo",
      "mama el bicho",
      "mámame el bicho",
      "coño",
      "coñazo",
      "coñal",
      "coñito",
      "coñón",
      "coñona",
      "coñísimo",
      "del coño",
      "ese coño",
      "vete al coño",
      "coño de tu madre",
      "coño e tu madre",
      "cabeza de bicho",
      "cabesa e bicho",
      "cabe'e bicho",
      "culo",
      "culos",
      "culito",
      "culote",
      "culazo",
      "toto",
      "tota",
      "totito",
      "totita",
      "totote",
      "cuero",
      "cueros",
      "cuerazo",
      "metele el rabo",
      "metete el rabo",
      "chupa rabo",
      "lame rabo",
      "come mierda",
      "comemierda",
      "comechicha",
      "comedura de cabeza",
      "eres un cuero",
      "la muy cuero",
      "cabrón",
      "cabrona",
      "cabronazo",
      "cabroneo",
      "cabroncete",
      "cabroncillo",
      "cabronerías",
      "pajero",
      "pajera",
      "pajúo",
      "pajúa",
      "pajazo",
      "pajear",
      "pajearse",
      "pajista",
      "moña",
      "moñeta",
      "dale moña",
      "metele moña",
      "pinga",
      "pingón",
      "pingona",
      "pingazo",
      "pingota",
      "pinguela",
      "ñema",
      "nema",
      "ñemazo",
      "nemazo",
      "ñemita",
      "nemita",
      "la ñema",
      "su ñema",
      "tu ñema",
      "chupa ñema",
      "chupa nema",
      "mama ñema",
      "mama nema",
      "mamá ñema",
      "mamá nema",
      "chupa pinga",
      "mamá pinga",
      "la pinga",
      "su pinga",
      "una pinga",
      "malparío",
      "malparida",
      "malparidos",
      "hijo e puta",
      "hijo de puta",
      "hijoputa",
      "hiputa",
      "hputa",
      "loco del culo",
      "métete el toto",
      "metete el toto",
      "chupa toto",
      "lame toto",
      "enseña el toto",
      "muestra el toto",
      "metete eso",
      "metetelo",
      "me lo metes",
      "mondá",
      "mondazo",
      "quédate",
      "figuero",
      "figuera",
      "mierda",
      "mierdo",
      "mierdoso",
      "mierdosa",
      "mierdal",
      "mierdero",
      "mierdecilla",
      "mierdecita",
      "mierducha",
      "un mierda",
      "eres una mierda",
      "vete a la mierda",
      "comer mierda",
      "bañado en mierda",
      "mierdazo",
      "mierdicola",
      "cagada",
      "cagado",
      "cagar",
      "cagando",
      "cagaste",
      "cagaste todo",
      "cagón",
      "cagona",
      "se cagó",
      "me cagó",
      "te cagó",
      "cagada de mierda",
      "que cagada",
      "puta",
      "puto",
      "putas",
      "putos",
      "putísimo",
      "putísima",
      "putazo",
      "putaza",
      "putería",
      "puteada",
      "putear",
      "puteando",
      "puteándote",
      "puteándome",
      "puteándola",
      "hija de puta",
      "maldita puta",
      "grandísima puta",
      "eres una puta",
      "te la puta",
      "la reputísima",
      "reputísima",
      "reputísima madre",
      "me cago en tu puta madre",
      "tu puta madre",
      "polla",
      "pollón",
      "pollazo",
      "pollito",
      "me la pelas con la polla",
      "polla en vinagre",
      "pollas en vinagre",
      "la polla",
      "verga",
      "vergón",
      "vergona",
      "vergajo",
      "vergota",
      "vergazo",
      "vergudo",
      "verguda",
      "vergajeada",
      "una verga",
      "su verga",
      "la verga",
      "la re verga",
      "puta verga",
      "vete a la verga",
      "no vale una verga",
      "me vale verga",
      "vale verga",
      "metete en el culo",
      "métete eso en el culo",
      "bésame el culo",
      "lame culo",
      "lameculos",
      "que te den por el culo",
      "vete al culo",
      "follar",
      "follando",
      "follándome",
      "follándote",
      "follándola",
      "follándolo",
      "follándose",
      "fóllame",
      "fóllate",
      "fóllate a",
      "fóllalo",
      "fóllala",
      "follón",
      "follona",
      "el folleteo",
      "que te folle",
      "te follo",
      "me follo",
      "hostia",
      "hostias",
      "hostiazos",
      "hostiaza",
      "me cago en la hostia",
      "qué hostia",
      "dar una hostia",
      "hostia puta",
      "la hostia",
      "gilipollas",
      "gilipollez",
      "gilipolleces",
      "gilipolla",
      "eres un gilipollas",
      "pendejo",
      "pendeja",
      "pendejos",
      "pendejas",
      "pendejazo",
      "pendejeada",
      "pendejear",
      "pendejeo",
      "no seas pendejo",
      "qué pendejo",
      "pendejísimo",
      "huevón",
      "huevona",
      "huevones",
      "huevonazo",
      "huevonada",
      "qué huevón",
      "hueva",
      "huevear",
      "hueveando",
      "chingar",
      "chingando",
      "chíngame",
      "chíngalo",
      "chíngala",
      "chíngase",
      "chingadera",
      "chingado",
      "chingada",
      "chingadazo",
      "a chingar",
      "vete a chingar",
      "chinga tu madre",
      "me chinga",
      "te chinga",
      "chingón",
      "chingona",
      "chingonería",
      "de la chingada",
      "no chingues",
      "qué chingados",
      "chingadamadre",
      "me cogió",
      "se cogió",
      "te cojo",
      "qué mamada",
      "no digas mamadas",
      "zorra",
      "zorras",
      "zorro",
      "zorrazo",
      "zorrada",
      "zorrera",
      "eres una zorra",
      "grandísima zorra",
      "perra",
      "perras",
      "perrazo",
      "perraje",
      "eres una perra",
      "puta perra",
      "grandísima perra",
      "bastardo",
      "bastarda",
      "bastardos",
      "bastardísimo",
      "bastardazo",
      "imbécil",
      "imbéciles",
      "imbecilidad",
      "marica",
      "maricón",
      "maricones",
      "maricona",
      "mariconazo",
      "mariconada",
      "mariconsillo",
      "concha",
      "conchuda",
      "conchudo",
      "concha de tu madre",
      "la concha",
      "tu concha",
      "boludo",
      "boluda",
      "boludos",
      "boludez",
      "boludeces",
      "pelotudo",
      "pelotuda",
      "pelotudos",
      "pelotudez",
      "malparido",
      "malnacido",
      "malnacida",
      "gonorrea",
      "gonorreica",
      "gonorreico",
      "qué gonorrea",
      "put4",
      "m13rda",
      "c0ño",
      "v3rg4",
      "h1jo d3 put4",
      "s1ng4o",
      "c4br0n",
      "c4br0n4",
      "p3nd3jo",
      "h1j0 d3 put4",
      "c0j3r",
      "f0ll4r",
      "h1j0eput4",
      "put@",
      "p*ta",
      "p.u.t.a",
      "m*erda",
      "c@brón",
      "h!jo de puta",
      "$ingao",
      "$ingar",
      "p u t a",
      "m i e r d a",
      "v e r g a",
      "c o ñ o",
      "f o l l a r",
      "s i n g a r",
      "c a b r ó n",
      "putaaa",
      "puttaaa",
      "miiierda",
      "mierdaaaa",
      "coooño",
      "vergaaaa",
      "singaoooo",
      "cabroooon",
      "peeendejo",
      "p-u-t-a",
      "m.i.e.r.d.a",
      "v-e-r-g-a",
      "c.o.ñ.o",
      "s-i-n-g-a-r",
      "hdp",
      "hdp.",
      "h.d.p",
      "hdlp",
      "hp",
      "vtm",
      "ctm",
      "stfu",
      "wtf",
      "omfg",
      "fck",
      "fuk",
      "fuc",
      "phuck",
      "vete al carajo",
      "vete al diablo",
      "métete eso por donde te quepa",
      "cierra la maldita boca",
      "te voy a romper la cara",
      "te voy a partir el culo",
      "eres una mierda de persona",
      "me cago en tu madre",
      "me cago en dios",
      "me cago en todo",
      "la reputísima madre",
      "la concha de tu madre",
      "hijo de la gran puta",
      "la gran puta",
      "tu madre es una puta",
      "tu madre la puta",
      "singale la madre",
      "cometela",
      "lámeme el culo",
      "bésame el trasero",
      "que te den",
      "que te partan",
      "vete a cagar",
      "anda a cagar",
      "que se joda",
      "que le den",
      "quédate callado maldito",
      "cállate la boca",
      "cierra ese culazo de boca",
      "$ingándome",
      "$ingándote",
      "s!ngar",
      "s!ngao",
      "s!ngando",
      "s1ngar",
      "s1ng4r",
      "s1ng4nd0",
      "s!ng4m3",
      "s.i.n.g.a.r",
      "s i n g a o",
      "s i n g á n d o m e",
      "singaaar",
      "singaooo",
      "singarrr",
      "singaaao",
      "$1ng4o",
      "$!ngao",
      "$!ngar",
      "$!ng4nd0",
      "sing@o",
      "sing@r",
      "sing@ndo",
      "sing@ndome",
      "s|ngar",
      "s|ngao",
      "s|ngando",
      "m4m4b!ch0",
      "mam4bicho",
      "mamaB1cho",
      "m@m@bicho",
      "mama-bicho",
      "mama.bicho",
      "ch@par",
      "ch@pando",
      "ch@pándome",
      "ch@pándosela",
      "ch@pándoselo",
      "ch!par",
      "ch!pando",
      "ch!pame",
      "ch!pamelo",
      "ch!paselo",
      "ch00par",
      "ch00pame",
      "ch00pamelo",
      "c0ñ0",
      "c@ño",
      "c@n0",
      "c!ño",
      "c!n0",
      "kon0",
      "k0ño",
      "koño",
      "c-o-ñ-o",
      "coñooo",
      "coñaaao",
      "c0ñ0000",
      "c@ñ0",
      "c@ñito",
      "c@ñazo",
      "coñ@",
      "coñ0",
      "c*ño",
      "c*n*",
      "p!nga",
      "p!ng4",
      "p1nga",
      "p1ng4",
      "p1ng4z0",
      "p!ngon",
      "p1ng0n",
      "p!ng0n4",
      "p|nga",
      "p|ng4",
      "p-i-n-g-a",
      "p.i.n.g.a",
      "p i n g a",
      "pingaaaa",
      "pingoooon",
      "p!ng4z0",
      "p@nga",
      "p@ng4",
      "ping@",
      "ping4",
      "p1ng0",
      "chupa-pinga",
      "chupa.pinga",
      "chup4p1ng4",
      "chup4-p1ng4",
      "chup4p!nga",
      "mam4p1ng4",
      "mama-pinga",
      "mama.pinga",
      "bichoooo",
      "bichaaao",
      "cab3z4 d3 bicho",
      "cab3z4 d3 b1cho",
      "c4b3z4d3b1ch0",
      "cab3za de bicho",
      "cabe e bicho:",
      "cab3 e b1cho",
      "cabe.e.bicho",
      "cabe-e-bicho",
      "c4bron",
      "c@bron",
      "c@br0n",
      "c@br0n4",
      "c!bron",
      "c4bronazo",
      "c4br0n4z0",
      "c-a-b-r-o-n",
      "c.a.b.r.o.n",
      "c a b r o n",
      "cabr0nnn",
      "c@br0nc3t3",
      "c4br0nc1ll0",
      "c0m3m13rd4",
      "com3mierda",
      "com3mierd4",
      "com3m13rda",
      "c0memierda",
      "c0mem13rda",
      "come-mierda",
      "come.mierda",
      "c0m3-m13rd4",
      "c0m3.m13rd4",
      "c 0 m e m i e r d a",
      "comemierdaaa",
      "c0m3m!3rd4",
      "h1j0d3put4",
      "h!jo de put@",
      "h1jo de put4",
      "hijo d3 put4",
      "hijo de put@",
      "h-i-j-o d-e p-u-t-a",
      "h.i.j.o.d.e.p.u.t.a",
      "h i j o d e p u t a",
      "hiiijo de puta",
      "hijoooo de puta",
      "h!j0 d3 put@",
      "h1j0 d3 p*ta",
      "hdput4",
      "h.d.p.u.t.a",
      "hijo e put@",
      "hijo e put4",
      "h1jo e put4",
      "hyjo de puta",
      "hijo_de_puta",
      "hijo-de-puta",
      "hijo.de.puta",
      "m4lpar!o",
      "m4lp4r10",
      "m4lp4r!o",
      "m4lp4r1o",
      "malp4rio",
      "malp4r!o",
      "malpar!o",
      "malpar1o",
      "m-a-l-p-a-r-i-o",
      "m.a.l.p.a.r.i.o",
      "m a l p a r i o",
      "malpariooo",
      "m4lp4r!d0",
      "malpar!da",
      "m0nda",
      "m0nd4",
      "m0ndazo",
      "m0nd4z0",
      "mond@",
      "mond4",
      "m-o-n-d-a",
      "m.o.n.d.a",
      "m o n d a",
      "mondaaaaa",
      "p4juo",
      "p4júo",
      "p4j3ro",
      "p4j3r0",
      "p@jero",
      "p@juo",
      "p-a-j-u-o",
      "p.a.j.u.o",
      "p a j u o",
      "pajuoooo",
      "p4j34r",
      "p4j3@r",
      "ñ3ma",
      "n3ma",
      "ñ e m a",
      "n e m a",
      "ñ-e-m-a",
      "n-e-m-a",
      "ñ.e.m.a",
      "n.e.m.a",
      "ñemaaa",
      "nemaaa",
      "porn",
      "porno",
      "pornografia",
      "pornografía",
      "pornography",
      "adult video",
      "sex video",
      "xxx",
      "sexcam",
      "camgirl",
      "cam boy",
      "onlyfans",
      "only fans",
      "xvideos",
      "xnxx",
      "redtube",
      "pornhub",
      "youporn",
      "spankbang",
      "xhamster",
      "brazzers",
      "escort",
      "nudes",
      "send nudes",
      "packs",
      "pack de fotos",
      "contenido adulto",
      "video sexual",
      "kill yourself",
      "go to hell",
      "fuck",
      "fucking",
      "shit",
      "bitch",
      "asshole",
      "motherfucker",
      "chupa bicho",
      "chupa guevo",
      "chupa huevo",
      "chúpame el bicho",
      "chúpame la pinga",
      "cabe e bicho",
      "cabeza e bicho"
  ];

  const FORUM_BLOCKED_DOMAINS = [
    "pornhub.com", "xvideos.com", "xnxx.com", "redtube.com", "youporn.com", "spankbang.com", "xhamster.com", "brazzers.com", "onlyfans.com"
  ];

  const WTRD_CONFUSABLE_CHAR_MAP = {
    // Cirílico / griego que visualmente parece latín.
    "а":"a", "е":"e", "о":"o", "р":"p", "с":"c", "у":"u", "х":"x", "і":"i", "ѕ":"s", "А":"a", "Е":"e", "О":"o", "Р":"p", "С":"c", "У":"u", "Х":"x", "І":"i", "Ѕ":"s",
    "α":"a", "ο":"o", "ρ":"p", "ν":"v", "υ":"u", "ι":"i", "κ":"k", "ϲ":"c", "Α":"a", "Ο":"o", "Ρ":"p", "Ν":"v", "Υ":"u", "Ι":"i", "Κ":"k", "Ϲ":"c",
    // Latin extendido/lookalikes comunes.
    "Ɑ":"a", "ɑ":"a", "ƿ":"p", "ɡ":"g", "ƨ":"s", "ɔ":"o", "ȼ":"c", "ɨ":"i", "ƚ":"l", "ƥ":"p", "ɓ":"b", "ɗ":"d", "ƈ":"c", "ȿ":"s", "ɀ":"z",
    // Algunos símbolos usados para reemplazar letras.
    "@":"a", "4":"a", "0":"o", "1":"i", "!":"i", "|":"i", "3":"e", "5":"s", "$":"s", "7":"t", "8":"b"
  };

  function foldConfusableCharacters(value = "") {
    return Array.from(String(value || "")).map(ch => WTRD_CONFUSABLE_CHAR_MAP[ch] || ch).join("");
  }

  function normalizeModerationText(value = "") {
    return foldConfusableCharacters(String(value || ""))
      .normalize("NFKC")
      // Proteger la ñ para no convertir "coño" en "cono" y bloquear palabras normales como "cono".
      .replace(/ñ/g, "xnyx")
      .replace(/Ñ/g, "xnyx")
      // Quitar Zalgo, tachados, macrons, combinados y marcas invisibles.
      .replace(/[̀-ͯ᷀-᷿⃐-⃿︠-︯]/g, "")
      .replace(/[​-‏⁠-⁤﻿­͏]/g, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/xnyx/g, "ñ")
      .replace(/[\_~`^¨´“”‘’]/g, " ")
      .replace(/[^a-z0-9ñ\s./:-]/gi, " ")
      .replace(/(.)\1{2,}/g, "$1$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactModerationText(value = "") {
    return normalizeModerationText(value).replace(/[^a-z0-9ñ]/g, "");
  }

  function looseModerationText(value = "") {
    return normalizeModerationText(value)
      .replace(/[./:-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function makeFlexibleTermPattern(term = "") {
    const compactTerm = compactModerationText(term);
    if (!compactTerm || compactTerm.length < 3) return null;
    const chars = Array.from(compactTerm).map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(chars.join("[^a-z0-9]{0,4}"), "i");
  }

  const FORUM_BANNED_COMPACT_PATTERNS = [
    /sing(a|ao|ada|ando|adera|on)/i,
    /mmg|mama?(bicho|pinga|guevo|huevo)/i,
    /chupa?(bicho|pinga|guevo|huevo)/i,
    /hijo(de|e)?puta|hijoputa|hputa|hdp/i,
    /come?mierda/i,
    /malpar(i|1)o/i,
    /cabron(a|azo)?/i,
    /coño/i,
    /pinga|ñema|nema|mond(a|o)|pajero/i,
    /fuck(ing)?|motherfucker|bitch|asshole|shit/i,
    /porn|porno|pornografia|pornography|xxx|onlyfans|xvideos|xnxx|redtube|pornhub|youporn|spankbang|xhamster|brazzers|escort|nudes/i
  ];

  function detectOffensiveTerm(rawText = "") {
    const normalized = looseModerationText(rawText);
    const compact = compactModerationText(rawText);
    if (!normalized && !compact) return null;

    for (const pattern of FORUM_BANNED_COMPACT_PATTERNS) {
      if (pattern.test(compact)) return "pattern";
    }

    for (const term of FORUM_BANNED_TERMS) {
      const n = normalizeModerationText(term);
      const c = compactModerationText(term);
      if (!n && !c) continue;
      if (n && normalized.includes(n)) return term;
      if (c && c.length >= 3 && compact.includes(c)) return term;
      const flexible = makeFlexibleTermPattern(term);
      if (flexible && flexible.test(normalized)) return term;
    }
    return null;
  }

  function extractDomainFromText(rawText = "") {
    const text = String(rawText || "").toLowerCase();
    const urls = text.match(/https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.(com|net|org|io|tv|app|site|online|link)\S*/gi) || [];
    for (const url of urls) {
      try {
        const normalized = url.startsWith("http") ? url : `https://${url}`;
        const host = new URL(normalized).hostname.replace(/^www\./, "");
        if (host) return host;
      } catch (_) {
        const m = String(url).match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i);
        if (m?.[1]) return m[1].replace(/^www\./, "");
      }
    }
    return "";
  }

  function detectForbiddenLink(rawText = "") {
    const text = String(rawText || "").toLowerCase();
    const normalized = normalizeModerationText(text);
    const compact = compactModerationText(text);
    const pornWords = /(porn|porno|pornografia|pornography|xxx|sexcam|camgirl|cam\s*boy|only\s*fans|onlyfans|xvideos|xnxx|redtube|pornhub|youporn|spankbang|xhamster|brazzers|escort|nudes|send\s*nudes|adult\s*video|video\s*sexual|contenido\s*adulto)/i;
    const domainHit = FORUM_BLOCKED_DOMAINS.find(domain => normalized.includes(domain) || compact.includes(compactModerationText(domain)));
    const disguisedDomainHit = /(pornhub|xvideos|xnxx|redtube|youporn|spankbang|xhamster|brazzers|only\s*fans|onlyfans)\s*(punto|dot|\.)\s*(com|net|tv)/i.exec(text);
    const domain = domainHit || extractDomainFromText(text) || (disguisedDomainHit ? `${disguisedDomainHit[1].replace(/\s+/g, "")}.${disguisedDomainHit[3]}` : "");
    if (domainHit || disguisedDomainHit || pornWords.test(text)) {
      return { domain: domain || "dominio no mostrado" };
    }
    return null;
  }

  function detectForumViolation(...parts) {
    const raw = parts.map(v => String(v || "")).join(" ");
    if (!raw.trim()) return null;
    const adultLink = detectForbiddenLink(raw);
    if (adultLink) {
      const domainText = adultLink.domain ? ` Dominio detectado: ${adultLink.domain}.` : "";
      return {
        type: "adult_link",
        reason: `Intentó publicar un enlace a una página de contenido adulto.${domainText}`,
        userMessage: "No se pudo publicar porque contiene un enlace no permitido."
      };
    }
    const offensiveHit = detectOffensiveTerm(raw);
    if (offensiveHit) {
      return {
        type: "offensive_language",
        reason: "Intentó publicar lenguaje ofensivo o una palabra bloqueada por las normas de la comunidad.",
        userMessage: "No se pudo publicar porque contiene contenido no permitido."
      };
    }
    return null;
  }

  window.WTForumModeration = {
    testText: (text = "") => detectForumViolation(text),
    normalizeText: (text = "") => normalizeModerationText(text),
    compactText: (text = "") => compactModerationText(text)
  };


  const NSFW_TFJS_SCRIPT_URLS = [
    // v3917: TensorFlow.js local dentro del ZIP para no depender de CDN.
    "vendor/tfjs/tf.min.js",
    "./vendor/tfjs/tf.min.js"
  ];
  const NSFWJS_SCRIPT_URLS = [
    // v3917: NSFWJS local dentro del ZIP para que funcione estable en PWA/PC/móvil.
    "vendor/nsfwjs/nsfwjs.min.js",
    "./vendor/nsfwjs/nsfwjs.min.js"
  ];
  const NSFWJS_MODEL_SCRIPT_URLS = [
    // NSFWJS Browserify local: modelo MobileNetV2 + pesos empacados como scripts.
    "vendor/nsfwjs/model/mobilenet_v2/model.min.js",
    "vendor/nsfwjs/model/mobilenet_v2/group1-shard1of1.min.js"
  ];
  const NSFWJS_MODEL_URLS = [
    "MobileNetV2"
  ];
  let nsfwModelPromise = null;

  function loadExternalScriptOnce(src, attrName = "data-wtrd-script") {
    return new Promise((resolve, reject) => {
      const escaped = (window.CSS?.escape ? CSS.escape(src) : String(src).replace(/"/g, '\\"'));
      const existing = document.querySelector(`script[${attrName}="${escaped}"]`);
      if (existing) {
        if (existing.dataset.loaded === "true") return resolve(existing);
        existing.addEventListener("load", () => resolve(existing), { once: true });
        existing.addEventListener("error", () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.defer = false;
      script.crossOrigin = "anonymous";
      script.referrerPolicy = "no-referrer";
      script.setAttribute(attrName, src);
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve(script);
      };
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  async function loadFirstAvailableScript(urls = [], label = "script") {
    let lastError = null;
    for (const src of urls) {
      try {
        return await withTimeout(loadExternalScriptOnce(src), 15000, `La carga de ${label} tardó demasiado.`);
      } catch (error) {
        lastError = error;
        console.warn(`No se pudo cargar ${label} desde ${src}`, error);
      }
    }
    throw lastError || new Error(`No se pudo cargar ${label}.`);
  }

  async function prepareTensorflowForNsfw() {
    await loadFirstAvailableScript(NSFW_TFJS_SCRIPT_URLS, "TensorFlow.js");
    if (!window.tf) throw new Error("TensorFlow.js no está disponible.");
    try {
      // CPU es más lento, pero evita muchos fallos de WebGL/iPhone/Android antiguos.
      if (window.tf.setBackend) await window.tf.setBackend("cpu");
      if (window.tf.ready) await window.tf.ready();
    } catch (error) {
      console.warn("TensorFlow.js cargó, pero no se pudo fijar backend CPU. Se usará el backend disponible.", error);
    }
  }

  async function loadNsfwModerationModel() {
    if (nsfwModelPromise) return nsfwModelPromise;
    nsfwModelPromise = (async () => {
      await prepareTensorflowForNsfw();
      await loadFirstAvailableScript(NSFWJS_SCRIPT_URLS, "NSFWJS");
      if (!window.nsfwjs?.load) throw new Error("NSFWJS no está disponible.");

      // v3917: cargar modelo local de NSFWJS antes de llamar nsfwjs.load().
      // Estos scripts exponen window.model y window.group1_shard1of1, que NSFWJS usa
      // para cargar MobileNetV2 sin descargar nada desde Internet.
      for (const modelScript of NSFWJS_MODEL_SCRIPT_URLS) {
        await withTimeout(loadExternalScriptOnce(modelScript, "data-wtrd-nsfw-model"), 20000, `La carga del modelo NSFWJS local tardó demasiado: ${modelScript}`);
      }

      let lastError = null;
      for (const modelUrl of NSFWJS_MODEL_URLS) {
        try {
          const model = await window.nsfwjs.load(modelUrl, { size: 224 });
          if (model?.classify) return model;
        } catch (error) {
          lastError = error;
          console.warn("No se pudo cargar el modelo NSFWJS local", modelUrl || "default", error);
        }
      }
      nsfwModelPromise = null;
      throw lastError || new Error("No se pudo cargar el modelo de moderación de imágenes.");
    })();
    return nsfwModelPromise;
  }

  async function imageElementFromFile(file, timeoutMs = 12000) {
    const { img, url } = await imageToBitmapUrl(file, timeoutMs);
    return { img, url };
  }

  function drawImageToNsfwCanvas(img, size = 224) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("No se pudo preparar la imagen para moderación.");

    const naturalWidth = Number(img.naturalWidth || img.width || 0);
    const naturalHeight = Number(img.naturalHeight || img.height || 0);
    if (!naturalWidth || !naturalHeight) throw new Error("La imagen no tiene dimensiones válidas para moderación.");

    // MobileNetV2/NSFWJS funciona más estable si recibe un canvas cuadrado
    // de 224x224. Se usa recorte centrado tipo cover para no deformar.
    const scale = Math.max(size / naturalWidth, size / naturalHeight);
    const drawWidth = Math.ceil(naturalWidth * scale);
    const drawHeight = Math.ceil(naturalHeight * scale);
    const dx = Math.floor((size - drawWidth) / 2);
    const dy = Math.floor((size - drawHeight) / 2);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
    return canvas;
  }

  function normalizeNsfwPredictions(predictions = []) {
    const rows = Array.isArray(predictions) ? predictions : [];
    const scoreFor = (...names) => rows
      .filter(item => names.includes(String(item.className || "").toLowerCase()))
      .reduce((sum, item) => sum + Number(item.probability || 0), 0);

    const porn = scoreFor("porn", "hentai");
    const sexy = scoreFor("sexy");
    const neutral = scoreFor("neutral", "drawing");
    const unsafeScore = Math.max(0, Math.min(1, porn + sexy));
    const adultScore = Math.max(0, Math.min(1, porn));
    const top = rows.slice().sort((a, b) => Number(b.probability || 0) - Number(a.probability || 0))[0] || null;
    return { unsafeScore, adultScore, neutralScore: neutral, topClass: top?.className || "unknown", predictions: rows };
  }

  async function analyzeImageWithNsfwJs(file) {
    let url = "";
    try {
      const model = await withTimeout(loadNsfwModerationModel(), 20000, "La moderación de imágenes tardó demasiado en cargar.");
      const prepared = await imageElementFromFile(file, 12000);
      url = prepared.url;
      const moderationCanvas = drawImageToNsfwCanvas(prepared.img, 224);
      const predictions = await withTimeout(model.classify(moderationCanvas), 16000, "La moderación de imágenes tardó demasiado.");
      moderationCanvas.width = 1;
      moderationCanvas.height = 1;
      const normalized = normalizeNsfwPredictions(predictions);
      const adultScore = Number(normalized.adultScore || 0);
      const unsafeScore = Number(normalized.unsafeScore || 0);

      if (adultScore >= 0.82 || unsafeScore >= 0.92) {
        return {
          status: "blocked",
          reason: "Imagen bloqueada por posible contenido adulto o explícito.",
          violation: { type: "image_adult_content", reason: "Imagen bloqueada por posible contenido adulto o explícito." },
          scores: normalized
        };
      }
      if (adultScore >= 0.45 || unsafeScore >= 0.62) {
        return {
          status: "needs_review",
          reason: "Imagen dudosa. Requiere aprobación manual.",
          scores: normalized
        };
      }
      return {
        status: "clean",
        reason: "Imagen limpia según revisión automática local.",
        scores: normalized
      };
    } catch (error) {
      console.warn("No se pudo analizar la imagen con NSFWJS", error);
      // v3917: como NSFWJS está local, si aun así falla es mejor dejar la imagen
      // pendiente para revisión manual en vez de aprobarla sin analizar.
      return {
        status: "needs_review",
        reason: "No se pudo completar la revisión local de la imagen. Requiere aprobación manual.",
        scores: { unsafeScore: 0, adultScore: 0, neutralScore: 0, topClass: "local_error" },
        error: error?.message || String(error)
      };
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function moderateForumImageFiles(files = [], { root = document, label = "imagen" } = {}) {
    const list = Array.from(files || []).filter(Boolean);
    const result = { needsApproval: false, files: [], violation: null };
    if (!list.length) return result;

    // v3923: toda imagen SIEMPRE se verifica con NSFWJS local.
    // Si NSFWJS la marca limpia, puede publicar directo cuando la configuración
    // de "imágenes a moderación" está apagada. Si NSFWJS falla, sale dudosa o
    // detecta desnudez/contenido adulto, queda pendiente o se bloquea.
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || "")) {
        result.needsApproval = true;
        result.files.push({
          name: file?.name || "imagen",
          status: "needs_review",
          nsfw_visual_status: "not_checked",
          reason: "Tipo de imagen no reconocido. Requiere revisión manual.",
          moderation_needs_review: true
        });
        continue;
      }
      updateUploadProgress(root, Math.max(5, Math.round(((index + 0.15) / list.length) * 25)), `Verificando ${label}${list.length > 1 ? ` ${index + 1}/${list.length}` : ""}`);
      const moderation = await analyzeImageWithNsfwJs(file);
      const visualStatus = moderation.status || "needs_review";
      const visualReason = moderation.reason || "Revisión automática local de imagen.";

      if (moderation.violation || visualStatus === "blocked") {
        const item = {
          name: file?.name || "imagen",
          status: "blocked",
          nsfw_visual_status: visualStatus,
          reason: visualReason,
          moderation_needs_review: false,
          nsfw_top_class: moderation.scores?.topClass || "unknown",
          nsfw_unsafe_score: Number(moderation.scores?.unsafeScore || 0),
          nsfw_adult_score: Number(moderation.scores?.adultScore || 0),
          checked_at: new Date().toISOString(),
          moderation_error: moderation.error || ""
        };
        result.files.push(item);
        result.violation = moderation.violation || { type: "image_adult_content", reason: visualReason };
        result.needsApproval = true;
        break;
      }

      const needsReview = visualStatus !== "clean";
      if (needsReview) result.needsApproval = true;
      result.files.push({
        name: file?.name || "imagen",
        status: needsReview ? "needs_review" : "clean",
        nsfw_visual_status: visualStatus,
        reason: needsReview ? visualReason : "Imagen verificada con NSFWJS local: no se detectó desnudez ni contenido adulto.",
        moderation_needs_review: needsReview,
        nsfw_top_class: moderation.scores?.topClass || "unknown",
        nsfw_unsafe_score: Number(moderation.scores?.unsafeScore || 0),
        nsfw_adult_score: Number(moderation.scores?.adultScore || 0),
        checked_at: new Date().toISOString(),
        moderation_error: moderation.error || ""
      });
    }
    return result;
  }

  async function registerForumWarningForUser(userId, violation, targetType = "content") {
    const reason = violation?.reason || "Contenido bloqueado por incumplir las reglas del foro.";
    if (!userId || !WT.supabase?.rpc) return { warnings_active: 0, blocked: false, reason };
    try {
      const { data, error } = await WT.supabase.rpc("register_forum_warning", {
        target_user_id: userId,
        target_type_text: targetType,
        target_id_value: null,
        reason_text: reason,
        rule_code_text: violation?.type || "forum_rule"
      });
      if (error) throw error;
      return normalizeCounterResult(data, "forum_warning");
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("function") || msg.includes("schema cache") || msg.includes("not found")) {
        console.warn("La moderación automática todavía no está lista:", error);
        return { warnings_active: 0, blocked: false, missingSql: true, reason };
      }
      throw error;
    }
  }

  async function handleForumViolation(userId, violation, targetType = "content") {
    if (String(state.myProfile?.id || "") === String(userId || "") && isOwnerProfile(state.myProfile)) {
      WT.toast(violation?.userMessage || "Contenido no publicado por incumplir las reglas.", "warning");
      return false;
    }
    const result = await registerForumWarningForUser(userId, violation, targetType);
    const active = Number(result.warnings_active || result.active_warnings || 0);
    if (result.blocked) {
      const blockReason = result.block_reason || "Tu cuenta fue bloqueada automáticamente por incumplir las normas de la comunidad.";
      await sendBanEmailNotification(userId, blockReason, true).catch(error => console.warn("No se pudo enviar correo de autobloqueo", error));
      if (window.WTPush?.sendPushNotification) {
        window.WTPush.sendPushNotification(userId, {
          title: "Cuenta bloqueada",
          body: blockReason,
          url: "foro.html"
        }).catch(() => null);
      }
      state.myProfile = null;
      try { await WT.getMyProfile?.({ refresh: true }); } catch (_) {}
      WT.toast("Tu cuenta fue bloqueada automáticamente por incumplir las normas de la comunidad.", "error");
    } else {
      await sendForumPush(userId, { title: "Advertencia del foro", body: "Contenido no publicado por incumplir las reglas de la comunidad.", url: "foro.html", type: "forum_warning", tag: "forum-warning" });
      WT.toast(violation?.userMessage || "Contenido no publicado por incumplir las reglas de la comunidad.", "warning");
    }
    return false;
  }

  function emptyPdfAnalysis(status = "pending") {
    return {
      status,
      relevance: status === "not_relevant" ? "not_relevant" : "unknown",
      message: status === "not_relevant" ? "Este PDF no parece contener información de una oferta laboral o detalles de Work and Travel." : "",
      company: "No detectado",
      position: "No detectado",
      state: "No detectado",
      city: "No detectado",
      hourlyPay: "No detectado",
      housingCost: "No detectado",
      housingDeposit: "No detectado",
      peoplePerRoom: "No detectado",
      estimatedHours: "No detectado",
      overtime: "No detectado",
      startDate: "No detectado",
      endDate: "No detectado",
      confidence: "low",
      positions: []
    };
  }

  function normalizePdfAnalysis(value = {}) {
    const base = emptyPdfAnalysis(value?.status || "completed");
    const src = value && typeof value === "object" ? value : {};
    const normalizePosition = (item = {}) => {
      const clean = (v) => String(v || "").trim() || "No detectado";
      return {
        company: clean(item.company || item.employer || src.company || src.employer),
        position: clean(item.position || item.jobTitle || item.title),
        state: clean(item.state),
        city: clean(item.city),
        hourlyPay: clean(item.hourlyPay || item.hourly_pay || item.pay || item.wage),
        housingCost: clean(item.housingCost || item.housing_cost || item.housing),
        housingDeposit: clean(item.housingDeposit || item.housing_deposit || item.deposit),
        peoplePerRoom: clean(item.peoplePerRoom || item.people_per_room || item.roommates),
        estimatedHours: clean(item.estimatedHours || item.estimated_hours || item.hours),
        overtime: clean(item.overtime),
        startDate: clean(item.startDate || item.start_date),
        endDate: clean(item.endDate || item.end_date)
      };
    };
    const rawPositions = Array.isArray(src.positions) ? src.positions
      : Array.isArray(src.jobs) ? src.jobs
      : Array.isArray(src.offers) ? src.offers
      : Array.isArray(src.plazas) ? src.plazas
      : [];
    const normalized = {
      ...base,
      company: src.company || src.employer || base.company,
      position: src.position || base.position,
      state: src.state || base.state,
      city: src.city || base.city,
      hourlyPay: src.hourlyPay || src.hourly_pay || src.pay || src.wage || base.hourlyPay,
      housingCost: src.housingCost || src.housing_cost || src.housing || base.housingCost,
      housingDeposit: src.housingDeposit || src.housing_deposit || src.deposit || base.housingDeposit,
      peoplePerRoom: src.peoplePerRoom || src.people_per_room || src.roommates || base.peoplePerRoom,
      estimatedHours: src.estimatedHours || src.estimated_hours || src.hours || base.estimatedHours,
      overtime: src.overtime || base.overtime,
      startDate: src.startDate || src.start_date || base.startDate,
      endDate: src.endDate || src.end_date || base.endDate,
      confidence: src.confidence || base.confidence,
      status: src.status || src.analysis_status || base.status,
      relevance: src.relevance || src.category || base.relevance,
      message: src.message || src.analysisMessage || src.analysis_message || base.message,
      positions: rawPositions.map(normalizePosition).filter(Boolean)
    };
    if (String(normalized.status || "").toLowerCase() === "not_relevant" || String(normalized.relevance || "").toLowerCase() === "not_relevant") {
      normalized.status = "not_relevant";
      normalized.relevance = "not_relevant";
      normalized.positions = [];
      normalized.message = normalized.message || "Este PDF no parece contener información de una oferta laboral o detalles de Work and Travel.";
      return normalized;
    }
    if (!normalized.positions.length && [normalized.company, normalized.position, normalized.state, normalized.city, normalized.hourlyPay, normalized.housingCost].some(v => v && v !== "No detectado")) {
      normalized.positions = [normalizePosition(normalized)];
    }
    return normalized;
  }

  function getPdfSummaryRows(analysis = {}) {
    return [
      ["Empresa / Empleador", analysis.company],
      ["Posición", analysis.position],
      ["Estado", analysis.state],
      ["Ciudad", analysis.city],
      ["Pago por hora", analysis.hourlyPay],
      ["Housing", analysis.housingCost],
      ["Depósito", analysis.housingDeposit],
      ["Personas por cuarto", analysis.peoplePerRoom],
      ["Horas estimadas", analysis.estimatedHours],
      ["Overtime", analysis.overtime],
      ["Fecha de inicio", analysis.startDate],
      ["Fecha final", analysis.endDate]
    ].filter(([, value]) => value && String(value).trim() && String(value).trim() !== "No detectado");
  }

  function storePdfForSummary(pdf = {}) {
    const key = `pdf-summary-${Date.now()}-${++pdfSummarySeq}`;
    pdfSummaryStore.set(key, pdf);
    return key;
  }

  function renderPdfSummary(pdf = {}) {
    const analysis = normalizePdfAnalysis(pdf.analysis || pdf.summary || {});
    const status = String(pdf.analysis_status || analysis.status || "pending").toLowerCase();
    const key = storePdfForSummary({ ...pdf, analysis, analysis_status: status });
    const positionsCount = Array.isArray(analysis.positions) ? analysis.positions.length : 0;
    const isNotRelevant = status === "not_relevant" || String(analysis.relevance || "").toLowerCase() === "not_relevant";
    const isError = status === "error" || status === "failed";
    const label = isNotRelevant ? "Ver estado del PDF" : status === "completed" ? (positionsCount > 1 ? `Ver resumen (${positionsCount} plazas)` : "Ver resumen") : isError ? "Resumen no disponible" : "Resumen pendiente";
    const hint = isNotRelevant ? "No se detectó información de Work and Travel" : status === "completed" ? "Información detectada automáticamente" : isError ? "No se pudo completar el análisis" : "Se mostrará cuando el análisis esté listo";
    return `<button type="button" class="forum-pdf-summary-trigger ${isNotRelevant ? "is-not-relevant" : status === "completed" ? "is-ready" : isError ? "is-error" : "is-pending"}" data-open-pdf-summary="${WT.escapeHTML(key)}">
      <span>${WT.escapeHTML(label)}</span>
      <small>${WT.escapeHTML(hint)}</small>
    </button>`;
  }

  function renderPdfAnalysisTable(analysis = {}) {
    const rows = getPdfSummaryRows(analysis);
    return rows.length
      ? `<div class="forum-pdf-summary-table">${rows.map(([label, value]) => `<div class="forum-pdf-summary-row"><span>${WT.escapeHTML(label)}</span><b>${WT.escapeHTML(value)}</b></div>`).join("")}</div>`
      : `<div class="empty-state small">No se detectaron datos suficientes en este PDF.</div>`;
  }

  function openPdfSummaryModal(key = "") {
    const pdf = pdfSummaryStore.get(key);
    if (!pdf) return WT.toast("No se encontró el resumen de este PDF.", "warning");
    const analysis = normalizePdfAnalysis(pdf.analysis || pdf.summary || {});
    const positions = Array.isArray(analysis.positions) ? analysis.positions : [];
    const status = String(pdf.analysis_status || analysis.status || "pending").toLowerCase();
    const isNotRelevant = status === "not_relevant" || String(analysis.relevance || "").toLowerCase() === "not_relevant";
    const general = renderPdfAnalysisTable(analysis);
    const plazas = !isNotRelevant && positions.length > 1 ? `<div class="forum-pdf-plazas">
      <h4>Plazas detectadas en este PDF</h4>
      ${positions.map((item, index) => `<section class="forum-pdf-plaza-card">
        <strong>Plaza ${index + 1}${item.position && item.position !== "No detectado" ? ` · ${WT.escapeHTML(item.position)}` : ""}</strong>
        ${renderPdfAnalysisTable(item)}
      </section>`).join("")}
    </div>` : "";
    const isError = status === "error" || status === "failed";
    const statusContent = isNotRelevant
      ? `<div class="forum-pdf-not-relevant-card"><strong>No se pudo generar un resumen útil</strong><p>${WT.escapeHTML(analysis.message || "Este PDF no parece contener información de una oferta laboral, plaza, pago, housing o detalles de Work and Travel.")}</p><small>Puedes abrir el PDF original para revisarlo manualmente.</small></div>`
      : status === "completed" ? general
      : isError ? `<div class="forum-pdf-not-relevant-card is-error"><strong>No se pudo completar el análisis</strong><p>${WT.escapeHTML(analysis.message || "La función de análisis no respondió correctamente. Puedes abrir el PDF original y volver a intentarlo más tarde.")}</p></div>`
      : `<div class="empty-state small">Resumen pendiente. El PDF se publicó, pero el análisis todavía no está completo.</div>`;
    const body = `<div class="forum-pdf-summary-modal ${isNotRelevant ? "is-not-relevant" : status === "completed" ? "is-ready" : isError ? "is-error" : "is-pending"}">
      <div class="forum-pdf-summary-modal-head">
        <span class="forum-pdf-badge">PDF</span>
        <div><strong>${WT.escapeHTML(pdf.name || pdf.fileName || "Documento PDF")}</strong><small>${WT.escapeHTML(formatBytes(pdf.size || pdf.fileSize) || "PDF")}</small></div>
      </div>
      ${isNotRelevant ? "" : `<p class="forum-pdf-summary-warning">Información extraída automáticamente. Verifica siempre el PDF original.</p>`}
      ${statusContent}
      ${plazas}
      <div class="forum-pdf-summary-modal-actions"><a class="btn btn-primary" href="${WT.escapeHTML(pdf.view_url || pdf.url || '#')}" target="_blank" rel="noopener noreferrer">Abrir PDF completo</a></div>
    </div>`;
    WT.showModal({ title: "Resumen del PDF", body, className: "forum-pdf-summary-viewer", closeOnBackdrop: true });
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
      reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
      reader.readAsDataURL(file);
    });
  }





  async function loadPdfJsLibrary() {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-pdfjs="true"]');
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.async = true;
        script.dataset.pdfjs = "true";
        script.onload = resolve;
        script.onerror = () => reject(new Error("No se pudo cargar PDF.js."));
        document.head.appendChild(script);
      });
    }

    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error("PDF.js no está disponible.");
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc || "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return pdfjsLib;
  }

  async function extractPdfContentWithPdfJs(file) {
    if (!file || (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || ""))) {
      return { text: "", hasImages: false, pages: 0, readablePages: 0 };
    }

    try {
      const pdfjsLib = await loadPdfJsLibrary();
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const maxPages = Math.min(pdf.numPages || 0, 12);
      const parts = [];
      let hasImages = false;
      let readablePages = 0;
      const OPS = pdfjsLib.OPS || {};
      const imageOps = new Set([
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintJpegXObject,
        OPS.paintImageMaskXObject,
        OPS.paintFormXObjectBegin
      ].filter(value => value !== undefined && value !== null));

      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent().catch(() => null);
        const pageText = (content?.items || [])
          .map(item => item && item.str ? item.str : "")
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (pageText) {
          readablePages += 1;
          parts.push(pageText);
        }

        try {
          const operatorList = await page.getOperatorList();
          if ((operatorList?.fnArray || []).some(fn => imageOps.has(fn))) hasImages = true;
        } catch (_) {
          // Si no podemos inspeccionar operadores, no bloqueamos por esto; solo enviamos a revisión si no hay texto legible.
        }
      }

      return {
        text: parts.join("\n").replace(/\s+/g, " ").trim().slice(0, 120000),
        hasImages,
        pages: pdf.numPages || 0,
        readablePages
      };
    } catch (error) {
      console.warn("No se pudo extraer contenido local del PDF", error);
      return { text: "", hasImages: false, pages: 0, readablePages: 0, error: error?.message || String(error) };
    }
  }

  async function extractPdfTextWithPdfJs(file) {
    const content = await extractPdfContentWithPdfJs(file);
    return content.text || "";
  }

  async function moderateForumPdfFiles(files = []) {
    const list = Array.from(files || []).filter(Boolean);
    const result = { needsApproval: false, files: [], violation: null };
    if (!list.length) return result;

    for (const file of list) {
      const content = await extractPdfContentWithPdfJs(file);
      const text = content.text || "";
      const violation = detectForumViolation(file?.name || "", text);
      const hasReadableText = text.trim().length >= 20;
      const needsReview = !hasReadableText || !!content.hasImages || !!content.error;
      const status = violation ? "blocked" : needsReview ? "needs_review" : "clean";
      const reason = violation?.reason
        || (!hasReadableText ? "PDF sin texto legible. Requiere revisión manual."
          : content.hasImages ? "PDF con imágenes internas. Requiere revisión manual."
          : content.error ? "No se pudo leer el PDF completo. Requiere revisión manual."
          : "PDF limpio y legible.");

      const item = {
        name: file?.name || "documento.pdf",
        status,
        reason,
        has_images: !!content.hasImages,
        has_readable_text: hasReadableText,
        readable_pages: Number(content.readablePages || 0),
        pages: Number(content.pages || 0),
        checked_at: new Date().toISOString()
      };
      result.files.push(item);

      if (violation) {
        result.violation = {
          type: violation.type || "pdf_forbidden_content",
          reason: "PDF bloqueado por contener lenguaje ofensivo, enlace prohibido o contenido no permitido."
        };
        result.needsApproval = true;
        break;
      }
      if (needsReview) result.needsApproval = true;
    }

    return result;
  }

  async function analyzePdfWithAI(file, base64 = "") {
    const cfg = getPdfConfig();
    if (!cfg.ENABLE_AI_SUMMARY) {
      return { analysis_status: "pending", analysis: emptyPdfAnalysis("pending") };
    }

    const endpoints = [cfg.AI_SUMMARY_ENDPOINT, cfg.AI_SUMMARY_FALLBACK_ENDPOINT]
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index);

    if (!endpoints.length) {
      return { analysis_status: "pending", analysis: emptyPdfAnalysis("pending") };
    }

    const extractedText = await extractPdfTextWithPdfJs(file);

    const body = JSON.stringify({
      name: file?.name || "documento.pdf",
      fileName: file?.name || "documento.pdf",
      size: Number(file?.size || 0),
      fileSize: Number(file?.size || 0),
      mime: "application/pdf",
      base64,
      text: extractedText,
      pdfText: extractedText,
      extractedText
    });

    for (const endpoint of endpoints) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (/supabase\.co\/functions\/v1\//i.test(endpoint)) {
          const anonKey = WT.cfg?.SUPABASE_ANON_KEY || window.WT_SUPABASE_CONFIG?.SUPABASE_ANON_KEY || "";
          if (anonKey) headers.apikey = anonKey;
          try {
            const { data } = WT.supabase?.auth?.getSession ? await WT.supabase.auth.getSession() : { data: null };
            const accessToken = data?.session?.access_token || "";
            if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
            else if (anonKey) headers.Authorization = `Bearer ${anonKey}`;
          } catch (_) {
            if (anonKey) headers.Authorization = `Bearer ${anonKey}`;
          }
        }
        const response = await fetch(endpoint, { method: "POST", headers, body });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.error || `No se pudo analizar el PDF en ${endpoint}`);
        }
        return {
          analysis_status: payload.analysis_status || "completed",
          analysis: normalizePdfAnalysis(payload.analysis || {})
        };
      } catch (error) {
        console.warn("No se pudo analizar el PDF en el endpoint configurado", endpoint, error);
      }
    }

    const failed = emptyPdfAnalysis("error");
    failed.message = "No se pudo completar el análisis del PDF. Revisa la Edge Function o intenta de nuevo.";
    return { analysis_status: "error", analysis: failed };
  }


  async function selectDriveAccountForPdf(fileSize = 0) {
    if (!WT.supabase?.from) return null;
    try {
      const { data, error } = await WT.supabase
        .from("drive_accounts")
        .select("id,name,upload_url,delete_url,folder_id,max_storage_bytes,used_storage_bytes,is_active,is_full,last_used_at,error_count")
        .eq("is_active", true)
        .eq("is_full", false);
      if (error) throw error;

      const safeReserve = Number(getPdfConfig().SAFE_RESERVE_BYTES || 150 * 1024 * 1024);
      const size = Number(fileSize || 0);
      const available = (Array.isArray(data) ? data : [])
        .filter(drive => drive?.upload_url)
        .filter(drive => {
          const max = Number(drive.max_storage_bytes || 0);
          const used = Number(drive.used_storage_bytes || 0);
          if (!max) return true;
          return (max - used) > (size + safeReserve);
        })
        .sort((a, b) => {
          const aErrors = Number(a.error_count || 0);
          const bErrors = Number(b.error_count || 0);
          if (aErrors !== bErrors) return aErrors - bErrors;
          const aLast = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
          const bLast = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
          if (aLast !== bLast) return aLast - bLast;
          const freeA = Number(a.max_storage_bytes || 0) - Number(a.used_storage_bytes || 0);
          const freeB = Number(b.max_storage_bytes || 0) - Number(b.used_storage_bytes || 0);
          return freeB - freeA;
        });
      return available[0] || null;
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("drive_accounts") || msg.includes("schema cache") || msg.includes("not found")) {
        console.warn("El servicio de archivos todavía no está completo. Se usará la ruta principal.", error);
        return null;
      }
      console.warn("No se pudo consultar el servicio de archivos. Se usará la ruta principal.", error);
      return null;
    }
  }

  async function recordDriveAccountUsage(driveId = "", bytes = 0, ok = true, errorText = "") {
    if (!driveId || !WT.supabase?.rpc) return;
    try {
      await WT.supabase.rpc("record_drive_account_usage", {
        drive_id_text: driveId,
        file_size_bytes: Math.trunc(Number(bytes || 0)),
        ok,
        error_text: errorText || null
      });
    } catch (error) {
      const msg = String(error?.message || "").toLowerCase();
      if (!msg.includes("function") && !msg.includes("schema cache") && !msg.includes("not found")) {
        console.warn("No se pudo actualizar el uso de Drive", driveId, error);
      }
    }
  }

  async function uploadForumPdfs(files = [], { limit = 1, root = document, user = null, postTitle = "" } = {}) {
    const cfg = getPdfConfig();
    const list = Array.from(files || []).filter(Boolean).slice(0, limit);
    if (!list.length) return [];

    if (!cfg.ENABLED || !cfg.UPLOAD_ENDPOINT) {
      throw new Error("La subida de PDF todavía no está configurada. Falta pegar la URL de Google Apps Script en GOOGLE_DRIVE_PDF.UPLOAD_ENDPOINT.");
    }

    const maxBytes = Number(cfg.MAX_BYTES || 5 * 1024 * 1024);
    let token = await WT.getAccessToken?.({ force: true });
    if (!token && WT.supabase?.auth?.getSession) {
      const sessionResult = await WT.supabase.auth.getSession().catch(() => null);
      token = sessionResult?.data?.session?.access_token || "";
    }
    if (!token) throw new Error("Tu sesión no está lista para subir PDF. Cierra sesión, vuelve a entrar y prueba de nuevo.");

    const result = [];
    showUploadProgress(root, "Subiendo PDF");
    for (let index = 0; index < list.length; index += 1) {
      const file = list[index];
      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
        throw new Error("Solo se permiten archivos PDF.");
      }
      if (file.size > maxBytes) {
        throw new Error(`El PDF "${file.name}" pesa demasiado. Máximo 5 MB.`);
      }

      setUploadProgress(root, Math.round(((index + .35) / list.length) * 100), `Preparando ${file.name}...`);
      const base64 = await fileToBase64(file);
      setUploadProgress(root, Math.round(((index + .65) / list.length) * 100), `Subiendo ${file.name}...`);

      const driveAccount = await selectDriveAccountForPdf(file.size);
      const endpoint = driveAccount?.upload_url || cfg.UPLOAD_ENDPOINT;
      let response;
      let payload = {};
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            token,
            name: file.name || `documento-${Date.now()}.pdf`,
            mime: "application/pdf",
            size: file.size,
            base64,
            context: "forum",
            title: postTitle || "",
            drive_id: driveAccount?.id || "",
            folder_id: driveAccount?.folder_id || ""
          })
        });

        const text = await response.text();
        try { payload = JSON.parse(text); } catch (_) {}
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "No se pudo subir el PDF a Google Drive.");
        }
        await recordDriveAccountUsage(payload.drive_id || driveAccount?.id || "", file.size, true, "");
      } catch (error) {
        await recordDriveAccountUsage(driveAccount?.id || "", 0, false, error?.message || "Error de subida");
        throw error;
      }

      setUploadProgress(root, Math.round(((index + .82) / list.length) * 100), `Analizando ${file.name}...`);
      const aiSummary = await analyzePdfWithAI(file, base64);

      result.push({
        name: payload.name || file.name,
        size: payload.size || file.size,
        mime: "application/pdf",
        drive_file_id: payload.drive_file_id || payload.fileId || "",
        drive_id: payload.drive_id || payload.driveId || driveAccount?.id || "",
        folder_id: payload.folder_id || payload.folderId || driveAccount?.folder_id || "",
        upload_url: endpoint,
        delete_url: driveAccount?.delete_url || endpoint,
        view_url: payload.view_url || payload.url || "",
        created_at: payload.created_at || new Date().toISOString(),
        analysis_status: aiSummary.analysis_status || "pending",
        analysis: aiSummary.analysis || emptyPdfAnalysis("pending")
      });
      setUploadProgress(root, Math.round(((index + 1) / list.length) * 100), `PDF listo ${index + 1}/${list.length}`);
    }
    return result.filter(p => p.view_url);
  }

  function collectPdfItemsFromRecord(record = {}) {
    return normalizePdfAttachments(record)
      .map(pdf => ({
        fileId: String(pdf.drive_file_id || pdf.fileId || pdf.file_id || "").trim(),
        driveId: pdf.drive_id || pdf.driveId || "",
        size: Number(pdf.size || pdf.fileSize || 0) || 0,
        endpoint: pdf.delete_url || pdf.deleteUrl || pdf.upload_url || pdf.uploadUrl || ""
      }))
      .filter(item => item.fileId);
  }

  async function deleteGoogleDrivePdfsFromRecords(records = []) {
    const cfg = getPdfConfig();
    const list = Array.isArray(records) ? records : [records];
    const map = new Map();
    list.flatMap(collectPdfItemsFromRecord).forEach(item => {
      map.set(`${item.driveId || "default"}:${item.fileId}`, item);
    });
    const items = [...map.values()];
    if (!items.length) return [];
    if (!cfg.ENABLED || !cfg.UPLOAD_ENDPOINT) {
      console.warn("No se puede borrar PDF: falta GOOGLE_DRIVE_PDF.UPLOAD_ENDPOINT.");
      return [];
    }

    let token = await WT.getAccessToken?.({ force: true });
    if (!token && WT.supabase?.auth?.getSession) {
      const sessionResult = await WT.supabase.auth.getSession().catch(() => null);
      token = sessionResult?.data?.session?.access_token || "";
    }
    if (!token) {
      console.warn("No se puede borrar PDF: sesión no disponible.");
      return [];
    }

    const results = [];
    for (const item of items) {
      try {
        const endpoint = item.endpoint || cfg.UPLOAD_ENDPOINT;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "delete", token, drive_file_id: item.fileId, fileId: item.fileId, drive_id: item.driveId || "" })
        });
        const text = await response.text();
        let payload = {};
        try { payload = JSON.parse(text); } catch (_) {}
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || "No se pudo borrar el PDF de Google Drive.");
        await recordDriveAccountUsage(item.driveId || payload.drive_id || "", -Math.abs(Number(item.size || 0)), true, "");
        results.push(payload);
      } catch (error) {
        console.warn("No se pudo borrar PDF de Google Drive", item.fileId, error);
      }
    }
    return results;
  }

  async function cleanupForumPostAssets(post = null, comments = []) {
    const records = [post, ...(Array.isArray(comments) ? comments : [])].filter(Boolean);
    const results = { images: [], pdfs: [] };
    try {
      if (WT.deleteR2ImagesFromRecords) results.images = await WT.deleteR2ImagesFromRecords(records);
    } catch (error) {
      console.warn("No se pudieron borrar todas las imágenes de la publicación", error);
    }
    try {
      results.pdfs = await deleteGoogleDrivePdfsFromRecords(records);
    } catch (error) {
      console.warn("No se pudieron borrar todos los PDFs del post en Google Drive", error);
    }
    return results;
  }

  function renderSelectedPdfPreview(files = [], root = document) {
    const box = WT.qs("[data-forum-selected-pdfs]", root);
    if (!box) return;
    const list = Array.from(files || []).filter(Boolean);
    const formScope = box.closest(".forum-post-form") || root;
    const hasPdf = list.length > 0;
    box.hidden = !hasPdf;
    formScope?.classList?.toggle("has-pdf-selected", hasPdf);
    box.innerHTML = list.map((file, index) => `
      <div class="forum-selected-pdf">
        <span class="forum-pdf-badge">PDF</span>
        <span class="forum-pdf-meta"><strong title="${WT.escapeHTML(file.name || "Documento.pdf")}">${WT.escapeHTML(file.name || "Documento.pdf")}</strong><small>${WT.escapeHTML(formatBytes(file.size) || "PDF")}</small></span>
        <button type="button" data-remove-selected-pdf="${index}" aria-label="Quitar PDF">×</button>
      </div>`).join("");
  }

  function renderAttachmentGallery(item = {}, mode = "post") {
    const files = normalizeAttachments(item).filter(a => a?.url);
    const pdfHtml = renderPdfAttachments(item);
    if (!files.length) return pdfHtml;
    const visible = files.slice(0, mode === "comment" ? 1 : 5);
    const data = encodeURIComponent(JSON.stringify(files.map(a => ({ url: a.url }))));
    const extra = files.length > visible.length ? files.length - visible.length : 0;
    return `<div class="forum-attachment-gallery forum-attachment-count-${visible.length} ${visible.length > 1 ? "is-multi" : "is-single"}" data-gallery="${data}">${visible.map((a, idx) => `
      <button class="forum-attachment" type="button" data-open-image-viewer data-image-index="${idx}" aria-label="Abrir imagen ${idx + 1}">
        <img class="forum-attachment-bg" loading="lazy" src="${WT.escapeHTML(a.url)}" alt="" aria-hidden="true">
        <img class="forum-attachment-img" loading="lazy" src="${WT.escapeHTML(a.url)}" alt="Imagen ${idx + 1}">
        ${extra && idx === visible.length - 1 ? `<span class="forum-attachment-more">+${extra}</span>` : ""}
      </button>`).join("")}</div>${pdfHtml}`;
  }

  function openImageViewer(images = [], startIndex = 0) {
    const list = (images || []).map(item => {
      if (typeof item === "string") return { url: WT.sanitizeImageUrl(item, "") };
      return { url: WT.sanitizeImageUrl(item?.url || "", "") };
    }).filter(img => img && img.url);

    if (!list.length) {
      WT.toast("No se encontró la imagen.", "warning");
      return;
    }

    // Cerrar cualquier visor anterior para evitar que quede una capa invisible bloqueando la página.
    document.querySelectorAll(".forum-image-viewer").forEach(el => el.remove());

    let index = Math.max(0, Math.min(Number(startIndex) || 0, list.length - 1));
    let closed = false;

    const old = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyTouchAction: document.body.style.touchAction
    };

    const backdrop = document.createElement("div");
    backdrop.className = "forum-image-viewer is-open";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("data-no-swipe", "true");
    backdrop.innerHTML = `
      <button class="forum-image-viewer-close" type="button" aria-label="Cerrar imagen">×</button>
      <button class="forum-image-viewer-nav prev" type="button" aria-label="Imagen anterior">‹</button>
      <figure class="forum-image-viewer-figure">
        <img class="forum-image-viewer-img" alt="Imagen de publicación" draggable="false">
      </figure>
      <button class="forum-image-viewer-nav next" type="button" aria-label="Imagen siguiente">›</button>
      <div class="forum-image-viewer-count" aria-live="polite"></div>
    `;

    const img = WT.qs(".forum-image-viewer-img", backdrop);
    const count = WT.qs(".forum-image-viewer-count", backdrop);
    const prev = WT.qs(".forum-image-viewer-nav.prev", backdrop);
    const next = WT.qs(".forum-image-viewer-nav.next", backdrop);
    const closeBtn = WT.qs(".forum-image-viewer-close", backdrop);

    function syncViewerNavPosition() {
      if (!img || !backdrop || closed) return;
      const rect = img.getBoundingClientRect();
      const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
      if (rect.height > 20 && rect.width > 20) {
        const centerY = Math.max(74, Math.min(viewportH - 74, rect.top + rect.height / 2));
        backdrop.style.setProperty("--viewer-control-y", `${centerY}px`);
      } else {
        backdrop.style.setProperty("--viewer-control-y", "50%");
      }
    }

    function restorePage() {
      document.documentElement.style.overflow = old.htmlOverflow;
      document.body.style.overflow = old.bodyOverflow;
      document.body.style.touchAction = old.bodyTouchAction;
      document.body.classList.remove("wt-image-viewer-open");
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", syncViewerNavPosition);
      window.removeEventListener("orientationchange", syncViewerNavPosition);
    }

    function close() {
      if (closed) return;
      closed = true;
      restorePage();
      backdrop.remove();
    }

    function go(delta) {
      if (list.length <= 1) return;
      index = (index + delta + list.length) % list.length;
      render();
    }

    function render() {
      const item = list[index];
      img.classList.add("is-loading");
      img.removeAttribute("src");

      const loader = new Image();
      loader.onload = () => {
        if (closed) return;
        img.src = item.url;
        img.classList.remove("is-loading");
        requestAnimationFrame(syncViewerNavPosition);
        setTimeout(syncViewerNavPosition, 80);
      };
      loader.onerror = () => {
        if (closed) return;
        img.classList.remove("is-loading");
        WT.toast("No se pudo abrir esta imagen.", "error");
      };
      loader.src = item.url;

      count.textContent = list.length > 1 ? `${index + 1} / ${list.length}` : "";
      prev.hidden = list.length <= 1;
      next.hidden = list.length <= 1;
    }

    function onKey(event) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }

    closeBtn.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    prev.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      go(-1);
    });

    next.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      go(1);
    });

    backdrop.addEventListener("click", event => {
      // Cerrar tocando el fondo negro, pero no al tocar botones o la imagen.
      if (event.target === backdrop || event.target.classList.contains("forum-image-viewer-figure")) close();
    });

    // Swipe interno del visor sin bloquear toda la página.
    let startX = 0;
    let startY = 0;
    let startAt = 0;

    backdrop.addEventListener("touchstart", event => {
      const t = event.touches?.[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      startAt = Date.now();
    }, { passive: true });

    backdrop.addEventListener("touchend", event => {
      const t = event.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const fast = Date.now() - startAt < 420;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.35 && fast) {
        event.preventDefault();
        go(dx < 0 ? 1 : -1);
      }
    }, { passive: false });

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", syncViewerNavPosition);
    window.addEventListener("orientationchange", syncViewerNavPosition);

    document.body.classList.add("wt-image-viewer-open");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    // No usar touch-action:none en el body; en iPhone puede dejar la página como congelada.
    document.body.appendChild(backdrop);
    render();
  }

  function showUploadProgress(root = document, label = "Subiendo archivo") {
    updateUploadProgress(root, 1, String(label || "Subiendo archivo").replace(/:\s*0%$/, ""));
  }

  function setUploadProgress(root = document, value = 0, label = "Subiendo archivo") {
    updateUploadProgress(root, value, label);
  }

  function updateUploadProgress(root, value, label = "Subiendo imagen") {
    const numericValue = Math.max(0, Math.min(100, Number(value) || 0));
    let box = WT.qs(".forum-upload-progress", root);
    if (!box) {
      box = document.createElement("div");
      box.className = "forum-upload-progress";
      box.setAttribute("role", "progressbar");
      box.setAttribute("aria-valuemin", "0");
      box.setAttribute("aria-valuemax", "100");
      box.innerHTML = `
        <div class="forum-upload-progress-head">
          <span class="forum-upload-progress-label"></span>
          <strong class="forum-upload-progress-value">0%</strong>
        </div>
        <div class="forum-upload-progress-track"><i></i></div>`;
      const actions = WT.qs(".forum-create-actions", root);
      if (actions?.parentNode) actions.parentNode.insertBefore(box, actions);
      else root.appendChild(box);
    }
    box.setAttribute("aria-valuenow", String(Math.round(numericValue)));
    const cleanLabel = String(label || "Subiendo archivo").replace(/:\s*\d+%$/, "");
    WT.qs(".forum-upload-progress-label", box).textContent = cleanLabel;
    WT.qs(".forum-upload-progress-value", box).textContent = `${Math.round(numericValue)}%`;
    WT.qs("i", box).style.width = `${numericValue}%`;
  }

  function clearUploadProgress(root = document) {
    WT.qsa(".forum-upload-progress", root).forEach(box => box.remove());
  }

  async function uploadForumImages(files, folder, { limit = 1, root = document } = {}) {
    const selected = Array.from(files || []).filter(f => f && f.size).slice(0, limit);
    const uploaded = [];
    if (!selected.length) return uploaded;

    const settings = await WT.getImageCompressionSettings().catch(() => ({ enabled: true, required: false, maxUploadMb: Number(getForumLimits().IMAGE_ORIGINAL_MAX_MB || 6), finalMaxMb: Number(getForumLimits().IMAGE_FINAL_MAX_MB || 3) }));
    const maxMb = Number(settings.maxUploadMb || getForumLimits().IMAGE_ORIGINAL_MAX_MB || 6) || 6;
    const finalMaxMb = Number(settings.finalMaxMb || getForumLimits().IMAGE_FINAL_MAX_MB || 3) || 3;
    for (let i = 0; i < selected.length; i++) {
      const file = selected[i];
      const labelSuffix = selected.length > 1 ? ` ${i + 1}/${selected.length}` : "";
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error("Solo se permiten imágenes JPG, PNG o WebP.");
      if (file.size > maxMb * 1024 * 1024) throw new Error(`La imagen es demasiado pesada. Máximo ${maxMb} MB por imagen.`);

      updateUploadProgress(root, 12, `Preparando${labelSuffix}`);
      await new Promise(r => setTimeout(r, 20));

      let imageBlob = file;
      let finalName = file.name || "image.jpg";
      let width = null;
      let height = null;
      let compressed = false;

      if (settings.enabled) {
        updateUploadProgress(root, 22, `Optimizando${labelSuffix}`);
        await new Promise(r => setTimeout(r, 40));
        updateUploadProgress(root, 36, `Convirtiendo a WebP${labelSuffix}`);
        const optimized = await compressForumImage(file, {
          maxBytes: maxMb * 1024 * 1024,
          use: folder.includes("comments") ? "comment" : "forum"
        });
        imageBlob = optimized.blob || file;
        finalName = optimized.fileName || file.name || finalName;
        width = optimized.width || null;
        height = optimized.height || null;
        compressed = !!optimized.compressed;
        updateUploadProgress(root, compressed ? 55 : 42, compressed ? `WebP listo${labelSuffix}` : `Original permitido${labelSuffix}`);
      } else {
        updateUploadProgress(root, 36, `Subiendo original${labelSuffix}`);
      }

      if ((imageBlob.size || 0) > finalMaxMb * 1024 * 1024) {
        throw new Error(`La imagen supera el límite final de ${finalMaxMb} MB. Recórtala o elige una más ligera.`);
      }

      await new Promise(r => setTimeout(r, 10));
      updateUploadProgress(root, 62, `Subiendo imagen${labelSuffix}`);

      const ext = fileExtensionFromBlob(imageBlob);
      const safeBase = String(finalName || file.name || "image").replace(/\.[a-z0-9]{2,6}$/i, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "image";
      const path = `${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}-${safeBase}.${ext}`;
      const uploadedImage = await withTimeout(
        WT.uploadBlob(WT.cfg.BUCKETS.content_images, path, imageBlob, {
          contentType: imageBlob.type || file.type || "image/jpeg",
          assetKind: folder.includes("comments") ? "forum_comment_image" : "forum_post_image",
          folder: folder.includes("comments") ? "forum-comments" : "forum-posts",
          fileName: `${safeBase}.${ext}`,
          forceR2: true,
          onProgress: (value) => updateUploadProgress(root, Math.max(30, Math.min(98, value)), `Subiendo${labelSuffix}`)
        }),
        90000,
        "La subida de imagen tardó demasiado. Revisa tu conexión e intenta de nuevo."
      );

      updateUploadProgress(root, 100, `Imagen lista${labelSuffix}`);
      uploaded.push({
        url: uploadedImage.url,
        key: uploadedImage.key || uploadedImage.path,
        path: uploadedImage.path || uploadedImage.key,
        provider: uploadedImage.provider || "cloudflare_r2",
        size: uploadedImage.size || imageBlob.size,
        mime: uploadedImage.type || imageBlob.type,
        width,
        height,
        compressed
      });
      await new Promise(r => setTimeout(r, 120));
    }
    clearUploadProgress(root);
    return uploaded;
  }

  function renderSelectedImagePreview(files = [], root) {
    const box = WT.qs("[data-forum-selected-images]", root) || WT.qs("[data-comment-selected-images]", root);
    if (!box) return;
    const list = Array.from(files || []).filter(Boolean);
    const formScope = box.closest(".forum-post-form") || root;
    formScope?.classList?.toggle("has-images-selected", list.length > 0);
    box.innerHTML = "";
    if (!list.length) {
      box.hidden = true;
      box.setAttribute("hidden", "");
      return;
    }
    box.hidden = false;
    box.removeAttribute("hidden");
    list.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const card = document.createElement("div");
      card.className = "forum-selected-image";
      card.innerHTML = `<img class="forum-selected-image-main" src="${url}" alt="Vista previa ${index + 1}">
        <button type="button" data-remove-selected-image="${index}" aria-label="Quitar imagen"></button>`;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      box.appendChild(card);
    });
  }

  async function hydrateLikedPosts(postIds = []) {
    state.likedPosts = new Set();
    const session = await WT.supabase.auth.getSession();
    const user = session?.data?.session?.user;
    if (!user || !postIds.length) return;

    const { data } = await WT.supabase
      .from("forum_likes")
      .select("post_id")
      .eq("target_type", "post")
      .eq("user_id", user.id)
      .in("post_id", postIds);

    (data || []).forEach(row => row.post_id && state.likedPosts.add(row.post_id));
  }

  async function hydrateLikedComments(commentIds = []) {
    state.likedComments = new Set();
    const session = await WT.supabase.auth.getSession();
    const user = session?.data?.session?.user;
    if (!user || !commentIds.length) return;

    const { data } = await WT.supabase
      .from("forum_likes")
      .select("comment_id")
      .eq("target_type", "comment")
      .eq("user_id", user.id)
      .in("comment_id", commentIds);

    (data || []).forEach(row => row.comment_id && state.likedComments.add(row.comment_id));
  }

  function renderPostCard(post) {
    const author     = post.author || {};
    const pending    = post.status === "pending";
    const category   = post.forum_categories?.name || "Foro";
    const body       = post.body || "";
    const excerpt    = renderMentions(body.slice(0, 200)) + (body.length > 200 ? "…" : "");
    const authorName = author.full_name || author.username || "Estudiante";
    const authorUsername = normalizeMentionUsername(author.username || authorName || "");
    const authorAvatar = WT.escapeHTML(WT.sanitizeImageUrl(author.photo_url, "images/placeholder-avatar.png"));
    const postImage  = renderAttachmentGallery(post, "post");
    const url        = postUrl(post.id);
    const liked      = state.likedPosts.has(post.id);
    const isAdmin    = ["admin","superadmin","moderator"].includes(author.role);
    const tagClass   = isAdmin ? "fa-post-card__tag--green" : "";

    const avatarHTML = authorAvatar
      ? `<img src="${authorAvatar}" alt="Foto de ${WT.escapeHTML(authorName)}" loading="lazy" />`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;

    return `<article class="fa-post-card" data-post-url="${WT.escapeHTML(url)}" role="link" tabindex="0" aria-label="Abrir publicación: ${WT.escapeHTML(post.title || "")}">

      <div class="fa-post-card__header">
        <button class="fa-post-card__avatar forum-author-trigger" type="button"
          data-open-public-profile="${renderAuthorPayloadForCard(author)}"
          aria-label="Ver perfil de ${WT.escapeHTML(authorName)}">
          ${avatarHTML}
        </button>

        <div class="fa-post-card__meta">
          <div class="fa-post-card__meta-top">
            <span class="fa-post-card__author">${WT.escapeHTML(authorName)}</span>
            <span class="fa-post-card__badges">${WT.renderRoleBadge(author.role || "user")}${WT.renderUserBadges(author.badges || [])}</span>
            <span class="fa-post-card__tag ${tagClass}">${WT.escapeHTML(category)}</span>
            ${pending ? `<span class="fa-post-card__tag fa-post-card__tag--orange">Pendiente</span>` : ""}
          </div>
          <div class="fa-post-card__time">${formatForumDateShort(post.created_at)}</div>
        </div>

        <button class="fa-post-card__more" type="button" data-report-post="${post.id}" title="Reportar publicación" aria-label="Reportar">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>
      </div>

      <h2 class="fa-post-card__title">
        <a href="${WT.escapeHTML(url)}">${WT.escapeHTML(post.title || "")}</a>
      </h2>
      ${excerpt ? `<p class="fa-post-card__preview">${excerpt}</p>` : ""}
      ${postImage}

      <div class="fa-post-card__divider"></div>

      <div class="fa-post-card__actions">
        <div class="fa-vote-group${liked ? " is-liked" : ""}">
          <button class="fa-vote-btn" type="button" data-like-post="${post.id}"
            aria-label="${liked ? "Quitar like" : "Dar like"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
          <div class="fa-vote-divider"></div>
          <span class="fa-vote-count">${compactNumber(post.likes_count || 0)}</span>
          <div class="fa-vote-divider"></div>
          <button class="fa-vote-btn" type="button" data-like-post="${post.id}"
            aria-label="${liked ? "Quitar like" : "Dar like"}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12l7 7 7-7"/>
            </svg>
          </button>
        </div>

        <a class="fa-action-btn fa-action-btn--comment" href="${WT.escapeHTML(url)}" aria-label="${compactNumber(post.comments_count || 0)} comentarios">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          ${compactNumber(post.comments_count || 0)}
        </a>

        <div class="fa-spacer"></div>

        <button class="fa-action-icon" type="button" title="Premiar publicación" aria-label="Premiar">🏅</button>

        ${canManageForumComments() && pending ? `<button class="fa-action-btn fa-admin-post-approve" type="button" data-approve-post="${WT.escapeHTML(post.id)}">Aprobar</button>` : ""}
        <button class="fa-action-icon" type="button" data-share-post="${post.id}" title="Compartir" aria-label="Compartir publicación">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15,3 21,3 21,9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
        ${canDeleteForumPost(post, author) ? `<button class="fa-action-btn fa-admin-post-delete" type="button" data-delete-post="${WT.escapeHTML(post.id)}">Eliminar</button>` : ""}
        ${canBlockForumUser(post.author_id, author.role) ? `<button class="fa-action-btn fa-admin-post-block" type="button" data-block-user="${WT.escapeHTML(post.author_id)}">Bloquear</button>` : ""}
      </div>

    </article>`;
  }

  /* Helper: serializa los datos del autor para el perfil público */
  function renderAuthorPayloadForCard(author = {}) {
    return encodeURIComponent(JSON.stringify({
      id:           author.id || "",
      full_name:    author.full_name || "Estudiante",
      username:     author.username || "",
      photo_url:    author.photo_url || "",
      role:         author.role || "user",
      badges:       Array.isArray(author.badges) ? author.badges : [],
      bio:          author.bio || "",
      city:         author.city || "",
      sponsor:      author.sponsor || "",
      program_year: author.program_year || ""
    }));
  }

  async function createPostModal() {
    const user = await WTAuth.requireAuth();
    if (!user) return;
    if (!state.categories.length) await loadCategories();

    const categoryOptions = state.categories
      .map(c => `<option value="${c.id}">${WT.escapeHTML(c.name)}</option>`)
      .join("");

    const body = `<form class="forum-post-form" id="postForm">
      <div class="forum-create-top">
        <div class="forum-community-pill" aria-label="Foro donde se publicará">
          <span class="forum-community-icon" aria-hidden="true">💬</span>
          <span class="forum-community-text">Foro de la comunidad</span>
        </div>
      </div>

      <label class="forum-field forum-title-field">
        <span>Título</span>
        <div class="forum-input-shell">
          <input class="forum-input" name="title" required maxlength="300" placeholder="Ej: ¿Qué preguntan en la entrevista J1?" autocomplete="off">
        </div>
        <small class="forum-counter" id="postTitleCounter">0/300</small>
      </label>

      <label class="forum-field forum-category-field">
        <span>Categoría</span>
        <div class="forum-input-shell forum-select-shell">
          <select class="forum-input forum-select" name="category_id" required>${categoryOptions}</select>
        </div>
      </label>

      <label class="forum-field forum-body-field">
        <span>Contenido</span>
        <div class="forum-input-shell forum-textarea-shell">
          <textarea class="forum-input forum-textarea" name="body" required rows="5" placeholder="Escribe tu pregunta o experiencia..."></textarea>
        </div>
      </label>

      <div class="forum-field forum-image-field">
        <span>Imágenes opcionales</span>
        <label class="forum-upload-dropzone">
          <input class="forum-file-input" name="post_images" type="file" accept="image/png,image/jpeg,image/webp" multiple>
          <span class="forum-upload-plus">＋</span>
          <strong>Añadir imágenes</strong>
          <small>Hasta 4 imágenes. Se muestran completas, sin recorte manual.</small>
        </label>
        <div class="forum-selected-images" data-forum-selected-images hidden></div>
      </div>

      <div class="forum-field forum-pdf-field">
        <span>Archivo PDF opcional</span>
        <label class="forum-upload-dropzone forum-pdf-dropzone">
          <input class="forum-pdf-input" name="post_pdfs" type="file" accept="application/pdf,.pdf">
          <span class="forum-pdf-upload-icon">PDF</span>
          <strong>Subir PDF</strong>
          <small>1 PDF por publicación. Máximo 5 MB. Cada PDF tendrá un resumen automático.</small>
        </label>
        <div class="forum-selected-pdfs" data-forum-selected-pdfs hidden></div>
      </div>

      <div class="forum-create-actions">
        <button class="btn btn-soft" type="button" data-close-post-modal>Cancelar</button>
        <button class="btn btn-primary" type="submit">Publicar</button>
      </div>
    </form>`;

    const modal = WT.showModal({ title: "Nueva publicación", body, className: "forum-create-modal", closeOnBackdrop: false });
    modal.element.classList.add("forum-create-backdrop");
    bindMentionAutocompletesIn(modal.element);

    const form = WT.qs("#postForm", modal.element);
    bindMentionAutocomplete(WT.qs('textarea[name="body"]', form));
    const titleInput = WT.qs('input[name="title"]', form);
    const counter = WT.qs("#postTitleCounter", form);
    titleInput?.addEventListener("input", () => {
      if (counter) counter.textContent = `${titleInput.value.length}/300`;
    });
    WT.qs("[data-close-post-modal]", form)?.addEventListener("click", () => modal.close());

    let selectedPostFiles = [];
    let selectedPostPdfs = [];
    const fileInput = WT.qs('input[name="post_images"]', form);
    fileInput?.addEventListener("change", () => {
      selectedPostFiles = Array.from(fileInput.files || []).filter(f => f && f.size).slice(0, Number(getForumLimits().IMAGES_PER_POST || 4));
      renderSelectedImagePreview(selectedPostFiles, form);
    });
    const pdfInput = WT.qs('input[name="post_pdfs"]', form);
    pdfInput?.addEventListener("change", () => {
      const max = Number(getPdfConfig().MAX_FILES_PER_POST || 1);
      selectedPostPdfs = Array.from(pdfInput.files || []).filter(f => f && f.size).slice(0, max);
      renderSelectedPdfPreview(selectedPostPdfs, form);
    });
    form.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-selected-image]");
      if (remove) {
        selectedPostFiles.splice(Number(remove.dataset.removeSelectedImage), 1);
        if (fileInput) fileInput.value = "";
        renderSelectedImagePreview(selectedPostFiles, form);
        return;
      }
      const removePdf = event.target.closest("[data-remove-selected-pdf]");
      if (removePdf) {
        selectedPostPdfs.splice(Number(removePdf.dataset.removeSelectedPdf), 1);
        if (pdfInput) pdfInput.value = "";
        renderSelectedPdfPreview(selectedPostPdfs, form);
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const myProfile = await WT.getMyProfile();
      const requireApprovalSetting = await WTContent.getPublicSetting("forum_require_approval", true);
      const mediaRequireApprovalSetting = await WTContent.getPublicSetting("forum_media_require_approval", false);
      const boolSetting = (value, fallback = false) => {
        if (typeof value === "boolean") return value;
        if (value == null) return fallback;
        return ["true", "1", "yes", "si", "sí", "on"].includes(String(value).trim().toLowerCase());
      };
      const requireApproval = boolSetting(requireApprovalSetting, true);
      const mediaRequireApproval = boolSetting(mediaRequireApprovalSetting, false);
      const isForumStaff = canManageForumComments() || WTAuth.isAdminRole(myProfile?.role);

      const submitBtn = WT.qs('button[type="submit"]', form);
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Publicando..."; }
      let images = [];
      let pdfs = [];
      try {
        await ensureUserCanUseForum(user.id);
        const titleText = String(fd.get("title") || "").trim();
        const bodyText = String(fd.get("body") || "").trim();
        await checkDailyLimit("images_uploaded", selectedPostFiles.length, Number(getForumLimits().IMAGES_PER_DAY || 20), "imágenes");
        await checkDailyLimit("pdfs_uploaded", selectedPostPdfs.length, Number(getPdfConfig().MAX_FILES_PER_DAY || getForumLimits().PDFS_PER_DAY || 5), "PDF");
        const violation = detectForumViolation(titleText, bodyText);
        if (violation) {
          await handleForumViolation(user.id, violation, "post");
          return;
        }
        const pdfModeration = await moderateForumPdfFiles(selectedPostPdfs);
        if (pdfModeration.violation) {
          await handleForumViolation(user.id, pdfModeration.violation, "post_pdf");
          return;
        }
        const imageModeration = await moderateForumImageFiles(selectedPostFiles, { root: form, label: "imagen" });
        if (imageModeration.violation) {
          await handleForumViolation(user.id, imageModeration.violation, "post_image");
          return;
        }
        images = await uploadForumImages(selectedPostFiles, `forum/posts/${user.id}`, { limit: Number(getForumLimits().IMAGES_PER_POST || 4), root: form });
        if (images.length && imageModeration.files?.length) {
          images = images.map((image, index) => {
            const moderation = imageModeration.files[index] || imageModeration.files.find(item => item.name === image.fileName || item.name === image.name) || {};
            return {
              ...image,
              moderation_status: moderation.status || "unknown",
              moderation_needs_review: moderation.status === "needs_review",
              moderation_reason: moderation.reason || "",
              nsfw_top_class: moderation.nsfw_top_class || "unknown",
              nsfw_unsafe_score: Number(moderation.nsfw_unsafe_score || 0),
              nsfw_adult_score: Number(moderation.nsfw_adult_score || 0),
              image_checked_at: moderation.checked_at || new Date().toISOString(),
              moderation_error: moderation.moderation_error || ""
            };
          });
        }
        pdfs = await uploadForumPdfs(selectedPostPdfs, {
          limit: Number(getPdfConfig().MAX_FILES_PER_POST || 1),
          root: form,
          user,
          postTitle: String(fd.get("title") || "").trim()
        });
        if (pdfs.length && pdfModeration.files?.length) {
          pdfs = pdfs.map((pdf, index) => {
            const moderation = pdfModeration.files[index] || pdfModeration.files.find(item => item.name === pdf.name) || {};
            return {
              ...pdf,
              moderation_status: moderation.status || "unknown",
              moderation_needs_review: moderation.status === "needs_review",
              moderation_reason: moderation.reason || "",
              pdf_has_images: !!moderation.has_images,
              pdf_has_readable_text: !!moderation.has_readable_text,
              pdf_checked_at: moderation.checked_at || new Date().toISOString()
            };
          });
        }
        clearUploadProgress(form);
        const firstImage = images[0] || null;
        const hasImageForModeration = selectedPostFiles.length > 0 || images.length > 0 || !!firstImage?.url;
        const needsPdfApproval = !!pdfModeration.needsApproval;
        const needsImageApproval = !!imageModeration.needsApproval || (mediaRequireApproval && hasImageForModeration);
        const needsApproval = requireApproval || needsImageApproval || needsPdfApproval;
        const status = isForumStaff || !needsApproval ? "approved" : "pending";
        const postPayload = {
          p_title: titleText,
          p_body: bodyText,
          p_category_id: fd.get("category_id") || null,
          p_status: status,
          p_image_url: firstImage?.url || null,
          p_image_path: firstImage?.path || firstImage?.key || null,
          p_image_key: firstImage?.key || firstImage?.path || null,
          p_attachments: images
        };

        const { data: createdPostId, error } = await WT.supabase.rpc("create_forum_post_safe", postPayload);
        if (error) throw error;

        let createdPost = null;
        try {
          const createdPostQuery = await WT.supabase
            .from("forum_posts")
            .select("id")
            .eq("author_id", user.id)
            .eq("title", postPayload.p_title)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          createdPost = createdPostQuery?.data || (createdPostId ? { id: createdPostId } : null);
        } catch (_) {
          createdPost = createdPostId ? { id: createdPostId } : null;
        }

        if (status === "approved" && createdPost?.id) {
          await notifyMentionedUsers({ text: `${titleText} ${bodyText}`, actorId: user.id, postId: createdPost.id, type: "post" });
        }

        if (pdfs.length) {
          try {
            if (createdPost?.id) {
              const { error: pdfUpdateError } = await WT.supabase
                .from("forum_posts")
                .update({ pdf_attachments: pdfs })
                .eq("id", createdPost.id);
              if (pdfUpdateError) throw pdfUpdateError;
            }
          } catch (pdfError) {
            console.warn("No se pudo guardar la metadata del PDF:", pdfError);
            WT.toast("La publicación se creó, pero no se pudo guardar el PDF adjunto.", "warning");
          }
        }

        await Promise.allSettled([
          commitDailyLimit("images_uploaded", images.length, Number(getForumLimits().IMAGES_PER_DAY || 20), "imágenes"),
          commitDailyLimit("pdfs_uploaded", pdfs.length, Number(getPdfConfig().MAX_FILES_PER_DAY || getForumLimits().PDFS_PER_DAY || 5), "PDF")
        ]);
        WT.toast(status === "approved" ? "Publicación enviada" : "Publicación enviada para aprobación", "success");
        modal.close();
        listPosts(true);
      } catch (error) {
        await cleanupUploadedForumAssets(images, pdfs);
        WT.toast(error.message || "No se pudo publicar", "error");
      } finally {
        clearUploadProgress(form);
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Publicar"; }
      }
    });
  }

  async function toggleLike({ targetType, postId = null, commentId = null }) {
    const user = await WTAuth.requireAuth();
    if (!user) return;

    const idField = targetType === "post" ? "post_id" : "comment_id";
    const idValue = targetType === "post" ? postId : commentId;

    const { data: existing, error: readError } = await WT.supabase
      .from("forum_likes")
      .select("id")
      .eq("target_type", targetType)
      .eq(idField, idValue)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) return WT.toast(readError.message, "error");

    if (existing?.id) {
      const { error } = await WT.supabase.from("forum_likes").delete().eq("id", existing.id).eq("user_id", user.id);
      if (error) return WT.toast(error.message, "error");
    } else {
      const payload = { target_type: targetType, user_id: user.id };
      if (targetType === "post") payload.post_id = postId;
      if (targetType === "comment") payload.comment_id = commentId;
      const { error } = await WT.supabase.from("forum_likes").insert(payload);
      if (error) return WT.toast(error.message, "error");
    }

    if (targetType === "post") {
      if (WT.page === "forum") listPosts(true);
      else loadPostDetail();
    } else {
      loadComments(state.currentPost?.id);
    }
  }

  async function likePost(postId) { return toggleLike({ targetType: "post", postId }); }
  async function likeComment(commentId) { return toggleLike({ targetType: "comment", commentId }); }

  async function reportTarget({ postId = null, commentId = null }) {
    const user = await WTAuth.requireAuth();
    if (!user) return;

    const modal = WT.showModal({
      title: "Reportar contenido",
      className: "forum-report-modal",
      body: `<form class="forum-report-form" id="reportForm"><label class="forum-report-label">Motivo<textarea class="input forum-report-textarea" name="reason" required placeholder="Explica el problema..."></textarea></label><button class="btn btn-danger forum-report-submit">Enviar reporte</button></form>`
    });

    WT.qs("#reportForm", modal.element).addEventListener("submit", async (event) => {
      event.preventDefault();
      const reason = new FormData(event.currentTarget).get("reason");
      const payload = { reporter_id: user.id, reason, target_type: postId ? "post" : "comment" };
      if (postId) payload.post_id = postId;
      if (commentId) payload.comment_id = commentId;

      const { error } = await WT.supabase.from("forum_reports").insert(payload);
      if (error) return WT.toast(error.message, "error");
      WT.toast("Reporte enviado", "success");
      modal.close();
    });
  }

  function getPostIdFromUrl() {
    return new URLSearchParams(location.search).get("id");
  }

  async function loadPostDetail() {
    const id = getPostIdFromUrl();
    const root = WT.qs("#postDetail");
    if (!root || !id || !WT.canConnect) return;

    const { data, error } = await WT.supabase
      .from("forum_posts")
      .select("*, forum_categories(name)")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      root.innerHTML = `<div class="empty-state">Publicación no encontrada.</div>`;
      return;
    }

    state.myProfile = state.myProfile || await WT.getMyProfile().catch(() => null);
    const currentUser = await WT.getCurrentUser().catch(() => null);
    const isOwner = currentUser?.id && String(currentUser.id) === String(data.author_id || "");
    if (String(data.status || "approved") === "pending" && !canManageForumComments() && !isOwner) {
      root.innerHTML = `<div class="empty-state">Publicación pendiente de revisión.</div>`;
      return;
    }
    const [post] = await WTContent.hydrateAuthors([data]);
    state.currentPost = post;
    const author = post.author || {};
    root.classList.remove("skeleton-card");
    await hydrateLikedPosts([post.id]);

    root.innerHTML = `<div class="post-topline">
        <span>${WT.escapeHTML(post.forum_categories?.name || "Foro")}</span><span>•</span><span>${WT.formatDate(post.created_at)}</span>${post.status === "pending" ? `<span class="category-pill status-pending-pill">Pendiente</span>` : ""}
      </div>
      <div class="post-head">
        ${renderAuthorTrigger(author)}
      </div>
      <h1>${WT.escapeHTML(post.title)}</h1>
      <div class="post-body">${renderMentions(post.body)}</div>
      ${renderAttachmentGallery(post, "post")}
      <div class="reddit-actions detail-actions">
        <span class="reddit-action-pill reddit-vote-pill ${state.likedPosts.has(post.id) ? "is-liked" : ""}">
          <button type="button" data-like-post="${post.id}" aria-label="Like">↑</button>
          <span class="reddit-score">${compactNumber(post.likes_count || 0)}</span>
          <button type="button" data-like-post="${post.id}" aria-label="Quitar like">↓</button>
        </span>
        <span class="reddit-action-pill">💬 ${compactNumber(post.comments_count || 0)}</span>
        <button class="reddit-action-pill" type="button" title="Premiar">🏅</button>
        <button class="reddit-action-pill" data-report-post="${post.id}" type="button">•••</button>
        ${canManageForumComments() && post.status === "pending" ? `<button class="reddit-action-pill admin-post-approve" data-approve-post="${WT.escapeHTML(post.id)}" type="button">Aprobar</button>` : ""}
        ${canDeleteForumPost(post, author) ? `<button class="reddit-action-pill admin-post-delete" data-delete-post="${WT.escapeHTML(post.id)}" type="button">Eliminar</button>` : ""}
        ${canBlockForumUser(post.author_id, author.role) ? `<button class="reddit-action-pill admin-post-block" data-block-user="${WT.escapeHTML(post.author_id)}" type="button">Bloquear</button>` : ""}
      </div>`;

    bindPublicProfileTriggers(root);
    await loadComments(id);
  }

  function buildCommentTree(comments) {
    const byId = new Map();
    const roots = [];

    comments.forEach(comment => byId.set(comment.id, { ...comment, children: [], reply_to_author: null }));

    byId.forEach(comment => {
      const parentId = comment.parent_comment_id;
      const parent = parentId ? byId.get(parentId) : null;
      if (parent) {
        comment.reply_to_author = parent.author || null;
        comment.reply_to_author_name = parent.author?.full_name || parent.author?.username || "Estudiante";
        comment.reply_to_author_username = normalizeMentionUsername(parent.author?.username || parent.author?.full_name || "");
        parent.children.push(comment);
      } else {
        roots.push(comment);
      }
    });

    const sortByDate = (items) => {
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      items.forEach(item => sortByDate(item.children));
    };
    sortByDate(roots);
    return roots;
  }

  function renderReplyTarget(comment, depth = 0) {
    if (!comment.parent_comment_id || depth <= 0) return "";
    const username = normalizeMentionUsername(comment.reply_to_author_username || comment.reply_to_author?.username || "");
    const fallback = normalizeMentionUsername(comment.reply_to_author_name || comment.reply_to_author?.full_name || "");
    const handle = username || fallback;
    if (!handle) return "";
    const bodyStart = String(comment.body || "").trimStart().toLowerCase();
    if (bodyStart.startsWith(`@${handle.toLowerCase()}`)) return "";
    return `<button type="button" class="ig-reply-prefix forum-mention-link" data-open-username-profile="${WT.escapeHTML(handle)}">@${WT.escapeHTML(handle)}</button> `;
  }

  function canManageForumComments() {
    const role = String(state.myProfile?.role || "").toLowerCase();
    return ["moderator", "moderador", "admin", "superadmin", "owner"].includes(role);
  }

  function canBlockForumUser(authorId = "", authorRole = "user") {
    const myId = String(state.myProfile?.id || "");
    const myRole = String(state.myProfile?.role || "").toLowerCase();
    const targetRole = String(authorRole || "user").toLowerCase();
    if (!canManageForumComments() || !authorId || String(authorId) === myId) return false;
    if (myRole === "owner") return true;
    if (targetRole === "owner") return false;
    return roleRank(myRole) > roleRank(targetRole);
  }

  async function sendBanEmailNotification(userId, reason, automatic = false) {
    if (!WT.supabase?.functions?.invoke) {
      return { error: { message: "El servicio de correo no está disponible en este momento." } };
    }
    return await WT.supabase.functions.invoke("send-ban-email", {
      body: {
        user_id: userId,
        target_user_id: userId,
        block_reason: reason,
        reason,
        automatic: Boolean(automatic)
      }
    });
  }

  function getEdgeFunctionError(result) {
    if (!result) return "La función no devolvió respuesta.";
    if (result.error) return result.error.message || result.error.context?.error || "No se pudo completar la acción.";
    if (result.data && result.data.ok === false) return result.data.error || result.data.message || "La función respondió con error.";
    return "";
  }



  async function createForumInternalNotification(userId, payload = {}) {
    if (!userId || !WT.supabase) return;
    try {
      await WT.supabase.from("notifications").insert({
        user_id: userId,
        type: payload.type || "forum_notification",
        title: payload.title || "Notificación",
        message: payload.body || payload.message || "",
        post_id: payload.post_id || payload.postId || null,
        comment_id: payload.comment_id || payload.commentId || null,
        actor_id: payload.actor_id || payload.actorId || null,
        created_at: new Date().toISOString()
      });
    } catch (error) {
      console.warn("No se pudo crear notificación interna del foro", error);
    }
  }

  async function sendForumPush(userId, payload = {}) {
    if (!userId) return;

    // Primero guardamos la notificación interna para que aparezca en la campanita,
    // aunque el navegador/push no esté activado.
    await createForumInternalNotification(userId, payload);

    if (!window.WTPush?.sendPushNotification) return;
    try { await window.WTPush.sendPushNotification(userId, payload); }
    catch (error) { console.warn("No se pudo enviar push del foro", error); }
  }

  async function deleteForumComment(commentId = "") {
    if (!commentId) return;
    let commentBeforeDelete = null;
    let commentAuthor = null;
    try {
      const result = await WT.supabase
        .from("forum_comments")
        .select("*")
        .eq("id", commentId)
        .maybeSingle();
      commentBeforeDelete = result?.data || null;
      if (commentBeforeDelete?.author_id) {
        const authorRes = await WT.supabase.from("user_profiles").select("id,role,full_name,email").eq("id", commentBeforeDelete.author_id).maybeSingle();
        commentAuthor = authorRes?.data || null;
      }
    } catch (_) {}
    if (!commentBeforeDelete || !canDeleteForumContent(commentBeforeDelete, commentAuthor || {})) {
      WT.toast("No tienes permisos para eliminar este comentario.", "error");
      return;
    }
    const ok = await WT.confirmDialog({
      title: "Eliminar comentario",
      message: "¿Seguro que quieres eliminar este comentario? También se borrarán sus imágenes externas.",
      confirmText: "Eliminar",
      danger: true
    });
    if (!ok) return;

    const { error } = await WT.supabase.from("forum_comments").delete().eq("id", commentId);
    if (error) {
      WT.toast(error.message || "No se pudo eliminar el comentario", "error");
      return;
    }

    await cleanupForumPostAssets(commentBeforeDelete, []);
    try { await WT.supabase.rpc("sync_drive_storage_counters"); } catch (_) {}
    WT.toast("Comentario eliminado", "success");
    await loadComments(state.currentPost?.id || getPostIdFromUrl());
  }

  async function approveForumComment(commentId = "") {
    if (!canManageForumComments()) {
      WT.toast("No tienes permisos para aprobar comentarios.", "error");
      return;
    }
    if (!commentId) return;
    let targetComment = null;
    try {
      const pre = await WT.supabase.from("forum_comments").select("id,post_id,author_id,body").eq("id", commentId).maybeSingle();
      targetComment = pre?.data || null;
    } catch (_) {}
    const { error } = await WT.supabase
      .from("forum_comments")
      .update({ status: "approved" })
      .eq("id", commentId);
    if (error) {
      WT.toast(error.message || "No se pudo aprobar el comentario", "error");
      return;
    }
    if (targetComment?.author_id) await sendForumPush(targetComment.author_id, { title: "Comentario aprobado", body: "Tu comentario fue aprobado en el foro.", url: `post.html?id=${targetComment.post_id || state.currentPost?.id || ""}`, type: "comment_approved", tag: `comment-approved-${commentId}` });
    WT.toast("Comentario aprobado", "success");
    await loadComments(state.currentPost?.id || getPostIdFromUrl());
  }

  async function blockForumUser(userId = "") {
    if (!canManageForumComments()) {
      WT.toast("No tienes permisos para bloquear usuarios.", "error");
      return;
    }
    if (!userId) return;
    if (String(userId) === String(state.myProfile?.id || "")) {
      WT.toast("No puedes bloquear tu propia cuenta.", "error");
      return;
    }

    const modal = WT.showModal({
      title: "Bloquear usuario",
      body: `<form class="admin-form" id="forumBlockUserForm">
        <p class="form-help">Indica el motivo. El usuario verá este mensaje dentro de la web app y recibirá un correo de moderación.</p>
        <label>Motivo del bloqueo<textarea class="input" name="reason" required rows="4" placeholder="Explica claramente el motivo del bloqueo"></textarea></label>
        <button class="btn btn-danger">Bloquear y enviar correo</button>
      </form>`
    });

    const form = WT.qs("#forumBlockUserForm", modal.element);
    form?.addEventListener("submit", async event => {
      event.preventDefault();
      const reason = String(new FormData(form).get("reason") || "").trim();
      if (!reason) {
        WT.toast("Debes indicar el motivo del bloqueo.", "warning");
        return;
      }

      const btn = form.querySelector("button");
      const oldText = btn?.textContent || "Bloquear y enviar correo";
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Bloqueando...";
      }

      const { error } = await WT.supabase.rpc("moderator_block_user", {
        target_user_id: userId,
        reason_text: reason
      });

      if (error) {
        if (btn) {
          btn.disabled = false;
          btn.textContent = oldText;
        }
        WT.toast(error.message || "No se pudo bloquear el usuario", "error");
        return;
      }

      if (btn) btn.textContent = "Enviando correo...";
      const emailResult = await sendBanEmailNotification(userId, reason, false);

      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText;
      }

      modal.close();
      const emailError = getEdgeFunctionError(emailResult);
      if (emailError) {
        WT.toast(`El usuario fue bloqueado, pero no se pudo enviar el correo: ${emailError}`, "warning");
      } else {
        WT.toast("Usuario bloqueado y correo enviado correctamente.", "success");
      }
    });
  }

  async function approveForumPost(postId = "") {
    if (!canManageForumComments()) {
      WT.toast("No tienes permisos para aprobar publicaciones.", "error");
      return;
    }
    if (!postId) return;
    let targetPost = null;
    try {
      const pre = await WT.supabase.from("forum_posts").select("id,title,author_id").eq("id", postId).maybeSingle();
      targetPost = pre?.data || null;
    } catch (_) {}
    const { error } = await WT.supabase
      .from("forum_posts")
      .update({ status: "approved", approved_by: state.myProfile?.id || null, approved_at: new Date().toISOString() })
      .eq("id", postId);
    if (error) {
      WT.toast(error.message || "No se pudo aprobar la publicación", "error");
      return;
    }
    if (targetPost?.author_id) await sendForumPush(targetPost.author_id, { title: "Publicación aprobada", body: `Tu publicación “${targetPost.title || "del foro"}” fue aprobada.`, url: `post.html?id=${postId}`, type: "post_approved", tag: `post-approved-${postId}` });
    WT.toast("Publicación aprobada", "success");
    if (WT.page === "post") await loadPostDetail();
    else await listPosts(true);
  }

  async function deleteForumPost(postId = "") {
    if (!postId) return;
    let postBeforeDelete = null;
    let commentsBeforeDelete = [];
    let authorRole = "user";
    try {
      const result = await WT.supabase.from("forum_posts").select("*").eq("id", postId).maybeSingle();
      postBeforeDelete = result?.data || null;
      if (!postBeforeDelete) return WT.toast("No se encontró la publicación.", "error");
      if (postBeforeDelete.author_id) {
        const profile = await WT.supabase.from("public_profiles").select("id,role").eq("id", postBeforeDelete.author_id).maybeSingle();
        authorRole = profile?.data?.role || "user";
      }
    } catch (_) {}
    if (!canDeleteForumPost(postBeforeDelete || {}, { role: authorRole })) {
      WT.toast("Solo puedes eliminar tu publicación durante los primeros 5 minutos. Después de ese tiempo, solo el equipo autorizado puede hacerlo.", "error");
      return;
    }
    const ok = await WT.confirmDialog({ title: "Eliminar publicación", message: "¿Seguro que quieres eliminar esta publicación? También se eliminarán sus archivos adjuntos.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try { const result = await WT.supabase.from("forum_comments").select("*").eq("post_id", postId); commentsBeforeDelete = Array.isArray(result?.data) ? result.data : []; } catch (_) {}
    const { error } = await WT.supabase.from("forum_posts").delete().eq("id", postId);
    if (error) return WT.toast(error.message || "No se pudo eliminar la publicación", "error");
    await cleanupForumPostAssets(postBeforeDelete, commentsBeforeDelete || []);
    try { await WT.supabase.rpc("sync_drive_storage_counters"); } catch (_) {}
    WT.toast("Publicación eliminada y archivos externos limpiados", "success");
    if (WT.page === "post") window.location.href = "foro.html"; else await listPosts(true);
  }

  function renderCommentAuthorBadge(author = {}) {
    const roleBadge = WT.renderRoleBadge ? WT.renderRoleBadge(author.role || "user") : "";
    const badges = WT.renderUserBadges ? WT.renderUserBadges(author.badges || []) : "";
    return `${roleBadge}${badges}`;
  }

  function renderComment(comment, depth = 0) {
    const author = comment.author || {};
    const safeDepth = depth > 0 ? 1 : 0;
    const isLiked = state.likedComments.has(comment.id);
    const authorName = author.full_name || author.username || "Estudiante";
    const authorUsername = normalizeMentionUsername(author.username || authorName || "");
    const authorAvatar = WT.escapeHTML(WT.sanitizeImageUrl(author.photo_url, "images/placeholder-avatar.png"));
    const replyPrefix = renderReplyTarget(comment, depth);
    const isPending = String(comment.status || "approved").toLowerCase() === "pending";

    return `<article class="ig-comment-row comment-card reddit-comment comment-depth-${safeDepth} ${isPending ? "is-pending-comment" : ""}" data-comment-id="${comment.id}" data-depth="${safeDepth}">
      <button class="ig-comment-avatar forum-author-trigger" type="button"
        data-open-public-profile="${renderAuthorPayloadForCard(author)}"
        aria-label="Ver perfil de ${WT.escapeHTML(authorName)}">
        <img src="${authorAvatar}" alt="Foto de ${WT.escapeHTML(authorName)}" loading="lazy">
      </button>

      <div class="ig-comment-main">
        <div class="ig-comment-line">
          <span class="ig-comment-author">${WT.escapeHTML(authorName)}</span>
          <span class="ig-comment-badges">${renderCommentAuthorBadge(author)}</span>
          <span class="ig-comment-time">${WT.formatDate(comment.created_at)}</span>
          ${isPending ? `<span class="ig-comment-status-pill">Pendiente</span>` : ""}
        </div>
        <p class="ig-comment-text">${replyPrefix}${renderMentions(comment.body)}</p>
        ${renderAttachmentGallery(comment, "comment")}
        <div class="ig-comment-actions">
          <button class="ig-comment-action" data-reply-comment="${comment.id}" data-reply-author-id="${WT.escapeHTML(comment.author_id || author.id || '')}" data-reply-author="${WT.escapeHTML(authorName)}" data-reply-username="${WT.escapeHTML(authorUsername)}" data-reply-body="${WT.escapeHTML(String(comment.body || '').slice(0, 180))}" data-reply-avatar="${authorAvatar}" type="button">Responder</button>
          <button class="ig-comment-action ig-comment-report" data-report-comment="${comment.id}" type="button">Reportar</button>
          ${canManageForumComments() && isPending ? `<button class="ig-comment-action ig-admin-approve" data-approve-comment="${WT.escapeHTML(comment.id)}" type="button">Aprobar</button>` : ""}
          ${canDeleteForumContent(comment, author) ? `<button class="ig-comment-action ig-admin-delete" data-delete-comment="${WT.escapeHTML(comment.id)}" type="button">Eliminar</button>` : ""}
          ${canBlockForumUser(comment.author_id, author.role) ? `<button class="ig-comment-action ig-admin-block" data-block-user="${WT.escapeHTML(comment.author_id)}" type="button">Bloquear</button>` : ""}
        </div>
      </div>

      <div class="ig-comment-likebox">
        <button class="ig-comment-like ${isLiked ? "is-liked" : ""}" type="button" data-like-comment="${comment.id}" aria-label="${isLiked ? "Quitar like" : "Dar like"}">♡</button>
        <span class="ig-comment-count">${compactNumber(comment.likes_count || 0)}</span>
      </div>
    </article>`;
  }

  function countCommentReplies(comment = {}) {
    const children = Array.isArray(comment.children) ? comment.children : [];
    return children.reduce((total, child) => total + 1 + countCommentReplies(child), 0);
  }

  function renderCommentThread(comment, depth = 0) {
    const current = renderComment(comment, depth);
    const children = (comment.children || []).map(child => renderCommentThread(child, depth + 1)).join("");
    if (!children) return current;

    const repliesCount = countCommentReplies(comment);
    const repliesId = `comment-replies-${String(comment.id || "").replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const groupClass = depth === 0 ? "comment-replies" : "comment-replies comment-replies--nested";
    const label = repliesCount === 1 ? "Ver 1 respuesta" : `Ver ${repliesCount} respuestas`;

    return `${current}
      <div class="comment-replies-toggle-wrap">
        <button class="comment-replies-toggle" type="button" data-toggle-comment-replies data-replies-target="${WT.escapeHTML(repliesId)}" data-replies-count="${repliesCount}" aria-expanded="false" aria-controls="${WT.escapeHTML(repliesId)}">${WT.escapeHTML(label)}</button>
      </div>
      <div id="${WT.escapeHTML(repliesId)}" class="${groupClass} is-collapsed" data-parent-comment-id="${WT.escapeHTML(comment.id)}">${children}</div>`;
  }

  async function loadComments(postId) {
    const root = WT.qs("#commentsList");
    if (!root || !postId) return;

    let commentsQuery = WT.supabase
      .from("forum_comments")
      .select("*")
      .eq("post_id", postId);

    commentsQuery = canManageForumComments()
      ? commentsQuery.or("status.is.null,status.eq.approved,status.eq.pending")
      : commentsQuery.or("status.is.null,status.eq.approved");

    const { data, error } = await commentsQuery.order("created_at", { ascending: true });

    if (error) return;

    state.myProfile = await WT.getMyProfile().catch(() => null);
    const comments = await WTContent.hydrateAuthors(data || []);
    state.commentsById = new Map((comments || []).map(c => [String(c.id), c]));
    await hydrateLikedComments(comments.map(c => c.id));
    const tree = buildCommentTree(comments);

    root.innerHTML = tree.length
      ? tree.map(c => renderCommentThread(c)).join("")
      : `<div class="empty-state">No hay comentarios aprobados todavía.</div>`;
    bindPublicProfileTriggers(root);
  }

  function setReplyTarget(commentId, authorName = "comentario", replyBody = "", replyAvatar = "", authorId = "", username = "") {
    const cleanUsername = normalizeMentionUsername(username || "");
    state.replyingTo = commentId ? {
      id: commentId,
      author_id: authorId || "",
      username: cleanUsername,
      authorName,
      body: String(replyBody || "").slice(0, 180),
      avatar: WT.sanitizeImageUrl(replyAvatar || "", "images/placeholder-avatar.png")
    } : null;

    const box = WT.qs("#replyingToBox");
    const text = WT.qs("#replyingToText");
    const input = WT.qs("#commentBody");
    const composer = WT.qs("#commentComposer");
    const preview = WT.qs("#replyPreviewBox");
    const previewAvatar = WT.qs("#replyPreviewAvatar");
    const previewAuthor = WT.qs("#replyPreviewAuthor");
    const previewText = WT.qs("#replyPreviewText");

    // No mostramos una barra extra de "Respondiendo a".
    // La vista previa del comentario seleccionado es suficiente y evita desorden visual en iPhone.
    if (box) box.hidden = true;
    if (text) text.textContent = "";
    if (preview) {
      preview.hidden = !state.replyingTo;
      if (state.replyingTo) preview.removeAttribute("hidden");
      else preview.setAttribute("hidden", "");
    }
    if (previewAvatar) previewAvatar.src = state.replyingTo?.avatar || "images/placeholder-avatar.png";
    if (previewAuthor) previewAuthor.textContent = state.replyingTo?.authorName || "";
    if (previewText) previewText.textContent = state.replyingTo?.body || "";
    if (composer) composer.classList.toggle("is-replying", !!state.replyingTo);
    if (!state.replyingTo && composer) {
      composer.classList.remove("is-replying");
      if (preview) {
        preview.hidden = true;
        preview.setAttribute("hidden", "");
      }
      if (previewAuthor) previewAuthor.textContent = "";
      if (previewText) previewText.textContent = "";
      if (input) input.placeholder = "¿Qué opinas sobre esto?";
    }
    if (input) {
      input.placeholder = state.replyingTo ? "Escribe tu respuesta..." : "¿Qué opinas sobre esto?";
      if (state.replyingTo) {
        if (state.replyingTo.username && !String(input.value || "").trim()) {
          input.value = `@${state.replyingTo.username} `;
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
        scrollComposerAboveKeyboard();
        setTimeout(syncCommentComposerKeyboard, 60);
      } else {
        // Al cancelar una respuesta no reenfocamos el input.
        // Esto evita que iOS vuelva a abrir el composer/teclado como comentario normal.
        if (document.activeElement && document.activeElement !== input && typeof document.activeElement.blur === "function") {
          try { document.activeElement.blur(); } catch (_) {}
        }
        setTimeout(syncCommentComposerKeyboard, 60);
      }
    }
    saveCommentDraft();
  }

  async function sendComment() {
    const user = await WTAuth.requireAuth();
    if (!user) return;

    const bodyEl = WT.qs("#commentBody");
    const body = bodyEl?.value?.trim();
    if (!body) return WT.toast("Escribe una respuesta primero", "warning");

    let bodyToSave = body;
    const replyUsername = normalizeMentionUsername(state.replyingTo?.username || "");
    if (state.replyingTo?.id && replyUsername) {
      const mentionPattern = new RegExp(`^@${replyUsername}\\b\\s*`, "i");
      bodyToSave = bodyToSave.replace(mentionPattern, "").trimStart();
      if (!bodyToSave.trim()) return WT.toast("Escribe una respuesta después de la mención.", "warning");
    }

    const myProfile = await WT.getMyProfile();
    const requireApprovalSetting = await WTContent.getPublicSetting("forum_require_approval", true);
    const mediaRequireApprovalSetting = await WTContent.getPublicSetting("forum_media_require_approval", false);
    const boolSetting = (value, fallback = false) => {
      if (typeof value === "boolean") return value;
      if (value == null) return fallback;
      return ["true", "1", "yes", "si", "sí", "on"].includes(String(value).trim().toLowerCase());
    };
    const requireApproval = boolSetting(requireApprovalSetting, true);
    const mediaRequireApproval = boolSetting(mediaRequireApprovalSetting, false);
    const isForumStaff = canManageForumComments() || WTAuth.isAdminRole(myProfile?.role);

    const fileInput = WT.qs("#commentImageInput");
    const sendBtn = WT.qs("#sendCommentBtn");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "Enviando..."; }
    let images = [];
    try {
      await ensureUserCanUseForum(user.id);
      await checkDailyLimit("images_uploaded", (fileInput?.files || []).length ? 1 : 0, Number(getForumLimits().IMAGES_PER_DAY || 20), "imágenes");
      const violation = detectForumViolation(bodyToSave);
      if (violation) {
        await handleForumViolation(user.id, violation, "comment");
        return;
      }
      const composer = WT.qs("#commentComposer") || document;
      const imageModeration = await moderateForumImageFiles(fileInput?.files || [], { root: composer, label: "imagen" });
      if (imageModeration.violation) {
        await handleForumViolation(user.id, imageModeration.violation, "comment_image");
        return;
      }
      images = await uploadForumImages(fileInput?.files || [], `forum-comments/${user.id}`, { limit: 1, root: composer });
      if (images.length && imageModeration.files?.length) {
        images = images.map((image, index) => {
          const moderation = imageModeration.files[index] || {};
          return {
            ...image,
            moderation_status: moderation.status || "unknown",
            moderation_needs_review: moderation.status === "needs_review",
            moderation_reason: moderation.reason || "",
            nsfw_top_class: moderation.nsfw_top_class || "unknown",
            nsfw_unsafe_score: Number(moderation.nsfw_unsafe_score || 0),
            nsfw_adult_score: Number(moderation.nsfw_adult_score || 0),
            image_checked_at: moderation.checked_at || new Date().toISOString(),
            moderation_error: moderation.moderation_error || ""
          };
        });
      }
      clearUploadProgress(composer);
      const firstImage = images[0] || null;
      const hasImageForModeration = (fileInput?.files || []).length > 0 || images.length > 0 || !!firstImage?.url;
      const needsImageApproval = !!imageModeration.needsApproval || (mediaRequireApproval && hasImageForModeration);
      const needsApproval = requireApproval || needsImageApproval;
      const status = isForumStaff || !needsApproval ? "approved" : "pending";
      const commentPayload = {
        p_post_id: state.currentPost.id,
        p_body: bodyToSave,
        p_status: status,
        p_parent_comment_id: state.replyingTo?.id || null,
        p_image_url: firstImage?.url || null,
        p_image_path: firstImage?.path || firstImage?.key || null,
        p_image_key: firstImage?.key || firstImage?.path || null,
        p_attachments: images
      };

      const { error } = await WT.supabase.rpc("create_forum_comment_safe", commentPayload);
      if (error) throw error;
      await commitDailyLimit("images_uploaded", images.length, Number(getForumLimits().IMAGES_PER_DAY || 20), "imágenes");
      if (status === "approved") {
        const postAuthorId = state.currentPost?.author_id || state.currentPost?.author?.id || "";
        if (postAuthorId && String(postAuthorId) !== String(user.id)) {
          await sendForumPush(postAuthorId, { title: "Nuevo comentario", body: "Alguien comentó tu publicación.", url: `post.html?id=${state.currentPost.id}`, type: "post_comment", tag: `post-comment-${state.currentPost.id}` });
        }
        if (state.replyingTo?.author_id && String(state.replyingTo.author_id) !== String(user.id)) {
          await sendForumPush(state.replyingTo.author_id, { title: "Nueva respuesta", body: "Alguien respondió tu comentario.", url: `post.html?id=${state.currentPost.id}`, type: "comment_reply", tag: `comment-reply-${state.replyingTo.id}` });
        }
        await notifyMentionedUsers({ text: bodyToSave, actorId: user.id, postId: state.currentPost.id, type: "comment" });
      }

      bodyEl.value = "";
      bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
      clearCommentDraft();
      if (fileInput) fileInput.value = "";
      const selectedImagesBox = WT.qs("[data-comment-selected-images]");
      if (selectedImagesBox) {
        selectedImagesBox.replaceChildren();
        selectedImagesBox.hidden = true;
        selectedImagesBox.setAttribute("hidden", "");
      }
      const previousY = window.scrollY;
      const parentId = state.replyingTo?.id || null;
      setReplyTarget(null);
      WT.toast(status === "approved" ? "Respuesta publicada" : "Respuesta enviada para aprobación", "success");
      await loadComments(state.currentPost.id);
      // No recargamos toda la publicación: eso provocaba saltos, desajustes y pérdida de posición en iPhone.
      // Si la respuesta fue a un comentario, abrimos el grupo de respuestas del comentario padre.
      if (parentId) {
        const safeId = String(parentId || "").replace(/[^a-zA-Z0-9_-]/g, "");
        const replies = WT.qs(`#comment-replies-${CSS.escape(safeId)}`);
        const toggle = WT.qs(`[data-replies-target="comment-replies-${CSS.escape(safeId)}"]`);
        if (replies) replies.classList.remove("is-collapsed");
        if (toggle) {
          toggle.setAttribute("aria-expanded", "true");
          toggle.textContent = "Ocultar respuestas";
        }
      }
      requestAnimationFrame(() => window.scrollTo({ top: previousY, left: 0, behavior: "auto" }));
    } catch (error) {
      WT.toast(error.message || "No se pudo comentar", "error");
    } finally {
      clearUploadProgress(WT.qs("#commentComposer") || document);
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Enviar"; }
    }
  }


  async function updateQuickComposerAvatar() {
    const avatars = [WT.qs("#quickComposerAvatar"), WT.qs("#commentComposerAvatar")].filter(Boolean);
    if (!avatars.length || !WT.canConnect) return;
    try {
      const profile = await WT.getMyProfile();
      const src = WT.sanitizeImageUrl(profile?.photo_url, "images/placeholder-avatar.png");
      avatars.forEach(avatar => { avatar.src = src; });
    } catch (_) {
      avatars.forEach(avatar => { avatar.src = "images/placeholder-avatar.png"; });
    }
  }

  function sharePost(postId) {
    const url = `${location.origin}${location.pathname.replace(/foro\.html$/, "post.html")}?id=${postId}`;
    if (navigator.share) navigator.share({ title: FORUM_NAME, url }).catch(() => {});
    else {
      navigator.clipboard?.writeText(url);
      WT.toast("Enlace copiado", "success");
    }
  }



  function getCommentDraftKey() {
    const postId = state.currentPost?.id || getPostIdFromUrl() || "post";
    return `wt_forum_comment_draft_${postId}`;
  }

  function saveCommentDraft() {
    const body = WT.qs("#commentBody")?.value || "";
    const draft = {
      body,
      replyingTo: state.replyingTo || null,
      updatedAt: Date.now()
    };
    try {
      if (body.trim() || draft.replyingTo) localStorage.setItem(getCommentDraftKey(), JSON.stringify(draft));
      else localStorage.removeItem(getCommentDraftKey());
    } catch (_) {}
  }

  function restoreCommentDraft() {
    const bodyEl = WT.qs("#commentBody");
    if (!bodyEl) return;
    try {
      const raw = localStorage.getItem(getCommentDraftKey());
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (!draft || Date.now() - Number(draft.updatedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(getCommentDraftKey());
        return;
      }
      if (draft.body && !bodyEl.value) {
        bodyEl.value = draft.body;
        bodyEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (draft.replyingTo?.id) {
        state.replyingTo = draft.replyingTo;
        const box = WT.qs("#replyingToBox");
        const text = WT.qs("#replyingToText");
        const composer = WT.qs("#commentComposer");
        const preview = WT.qs("#replyPreviewBox");
        const previewAvatar = WT.qs("#replyPreviewAvatar");
        const previewAuthor = WT.qs("#replyPreviewAuthor");
        const previewText = WT.qs("#replyPreviewText");
        if (box) box.hidden = true;
        if (text) text.textContent = "";
        if (preview) preview.hidden = false;
        if (previewAvatar) previewAvatar.src = WT.sanitizeImageUrl(draft.replyingTo.avatar || "", "images/placeholder-avatar.png");
        if (previewAuthor) previewAuthor.textContent = draft.replyingTo.authorName || "comentario";
        if (previewText) previewText.textContent = draft.replyingTo.body || "Comentario seleccionado";
        if (composer) composer.classList.add("is-replying");
        bodyEl.placeholder = "Escribe tu respuesta...";
      }
    } catch (_) {}
  }

  function clearCommentDraft() {
    try { localStorage.removeItem(getCommentDraftKey()); } catch (_) {}
  }

  function syncCommentComposerKeyboard() {
    const composer = WT.qs("#commentComposer");
    if (!composer) return;
    const vv = window.visualViewport;

    const apply = () => {
      let keyboardOpen = false;
      let keyboard = 0;

      if (vv) {
        const visibleBottom = (vv.offsetTop || 0) + vv.height;
        keyboard = Math.max(0, Math.round(window.innerHeight - visibleBottom));
        keyboardOpen = keyboard > 70 || vv.height < window.innerHeight * 0.82;
      } else {
        keyboardOpen = document.body.classList.contains("comment-composer-focused");
        keyboard = keyboardOpen ? 300 : 0;
      }

      const offset = keyboardOpen ? Math.max(0, keyboard + 2) : 0;
      document.body.style.setProperty("--comment-keyboard-offset", `${offset}px`);
      document.documentElement.style.setProperty("--comment-keyboard-offset", `${offset}px`);
      // Se mantiene por compatibilidad con CSS viejo, pero ya no posicionamos con top.
      document.body.style.removeProperty("--comment-composer-top");
      document.documentElement.style.removeProperty("--comment-composer-top");
      composer.classList.toggle("keyboard-open", keyboardOpen);
      document.documentElement.classList.toggle("comment-keyboard-open", keyboardOpen);
      document.body.classList.toggle("comment-keyboard-open", keyboardOpen);
    };

    apply();
    requestAnimationFrame(apply);

    if (vv && !composer.dataset.keyboardBound) {
      composer.dataset.keyboardBound = "1";
      vv.addEventListener("resize", apply, { passive: true });
      vv.addEventListener("scroll", apply, { passive: true });
      window.addEventListener("resize", apply, { passive: true });
      window.addEventListener("orientationchange", () => setTimeout(apply, 350), { passive: true });
      document.addEventListener("scroll", apply, { passive: true });
    }
  }

  function scrollComposerAboveKeyboard() {
    // No usamos scrollIntoView en iPhone/PWA porque mueve el layout,
    // monta la barra sobre la navegación y crea espacios vacíos.
    // El composer se fija con visualViewport en syncCommentComposerKeyboard().
    syncCommentComposerKeyboard();
    requestAnimationFrame(syncCommentComposerKeyboard);
    setTimeout(syncCommentComposerKeyboard, 80);
    setTimeout(syncCommentComposerKeyboard, 240);
  }

  function bindForumEvents() {
    if (!document.body.dataset.mentionGlobalTouchBound) {
      document.body.dataset.mentionGlobalTouchBound = "1";
      document.addEventListener("touchstart", (event) => {
        if (!event.target.closest?.(".forum-mention-suggest, textarea, input")) hideAllMentionSuggests?.();
      }, { passive: true });
      document.addEventListener("mousedown", (event) => {
        if (!event.target.closest?.(".forum-mention-suggest, textarea, input")) hideAllMentionSuggests?.();
      });
    }

    WT.qs("#newPostBtn")?.addEventListener("click", createPostModal);
    WT.qs("#sidebarPostBtn")?.addEventListener("click", createPostModal);
    WT.qs("#quickComposer")?.addEventListener("click", createPostModal);
    WT.qs("#quickComposer")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") createPostModal();
    });
    WT.qs("#loadMorePosts")?.addEventListener("click", (event) => {
      if (event.currentTarget.disabled) return;
      listPosts(false);
    });

    ["#forumSearch", "#forumCategory", "#forumSort"].forEach(sel => {
      WT.qs(sel)?.addEventListener("input", () => listPosts(true));
      WT.qs(sel)?.addEventListener("change", () => listPosts(true));
    });

    document.querySelectorAll("[data-sort-short]").forEach(tab => tab.addEventListener("click", () => {
      document.querySelectorAll("[data-sort-short]").forEach(t => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const sort = WT.qs("#forumSort");
      if (sort) sort.value = tab.dataset.sortShort || "recent";
      listPosts(true);
    }));

    WT.qs("#sendCommentBtn")?.addEventListener("click", sendComment);
    const commentBody = WT.qs("#commentBody");
    if (commentBody) {
      bindMentionAutocomplete(commentBody);
      const resizeCommentBody = () => {
        commentBody.style.setProperty("height", "auto", "important");
        const nextHeight = Math.max(44, Math.min(commentBody.scrollHeight, 96));
        commentBody.style.setProperty("height", `${nextHeight}px`, "important");
        WT.qs("#commentComposer")?.classList.toggle("has-text", !!commentBody.value.trim());
        syncCommentComposerKeyboard();
      };
      commentBody.addEventListener("focus", () => {
        if (!state.replyingTo) {
          const composer = WT.qs("#commentComposer");
          composer?.classList.remove("is-replying");
          const preview = WT.qs("#replyPreviewBox");
          if (preview) preview.hidden = true;
        }
        document.body.classList.add("comment-composer-focused");
        document.documentElement.classList.add("comment-composer-focused");
        scrollComposerAboveKeyboard();
        setTimeout(syncCommentComposerKeyboard, 80);
        setTimeout(syncCommentComposerKeyboard, 260);
        setTimeout(syncCommentComposerKeyboard, 520);
      });
      commentBody.addEventListener("blur", () => setTimeout(() => {
        document.body.classList.remove("comment-composer-focused", "comment-keyboard-open");
        document.documentElement.classList.remove("comment-composer-focused", "comment-keyboard-open");
        document.body.style.setProperty("--comment-keyboard-offset", "0px");
        WT.qs("#commentComposer")?.classList.remove("keyboard-open");
      }, 220));
      commentBody.addEventListener("input", () => { resizeCommentBody(); saveCommentDraft(); });
      resizeCommentBody();
      syncCommentComposerKeyboard();
      restoreCommentDraft();
      window.addEventListener("beforeunload", saveCommentDraft);
      window.addEventListener("pagehide", saveCommentDraft);
      window.addEventListener("pageshow", () => { restoreCommentDraft(); syncCommentComposerKeyboard(); });
      window.addEventListener("online", async () => {
        restoreCommentDraft();
        if (state.currentPost?.id) await loadComments(state.currentPost.id).catch(() => {});
      });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") saveCommentDraft();
        else { restoreCommentDraft(); syncCommentComposerKeyboard(); }
      });
    }
    WT.qs("#commentImageInput")?.addEventListener("change", (event) => {
      const composer = WT.qs("#commentComposer");
      if (!composer) return;
      let preview = WT.qs("[data-comment-selected-images]", composer);
      if (!preview) {
        preview = document.createElement("div");
        preview.className = "forum-selected-images comment-selected-images ig-selected-images";
        preview.setAttribute("data-comment-selected-images", "");
        const replyPreview = WT.qs("#replyPreviewBox", composer);
        const inputRow = WT.qs(".ig-comment-input-row", composer);
        composer.insertBefore(preview, replyPreview || inputRow || composer.firstChild);
      }
      // La imagen seleccionada siempre va arriba: primero imagen, luego comentario respondido, luego caja de texto.
      const replyPreview = WT.qs("#replyPreviewBox", composer);
      const inputRow = WT.qs(".ig-comment-input-row", composer);
      if (preview && preview.parentNode === composer) composer.insertBefore(preview, replyPreview || inputRow || composer.firstChild);
      renderSelectedImagePreview(Array.from(event.target.files || []).slice(0, 1), composer);
      preview.hidden = !(event.target.files || []).length;
      if ((event.target.files || []).length) preview.removeAttribute("hidden");
      saveCommentDraft();
      syncCommentComposerKeyboard();
    });

    WT.qs("#commentComposer")?.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove-selected-image]");
      if (!remove) return;
      event.preventDefault();
      event.stopPropagation();
      const input = WT.qs("#commentImageInput");
      if (input) input.value = "";
      const preview = WT.qs("[data-comment-selected-images]", WT.qs("#commentComposer"));
      if (preview) {
        preview.replaceChildren();
        preview.hidden = true;
        preview.setAttribute("hidden", "");
      }
      saveCommentDraft();
      syncCommentComposerKeyboard();
    });
    WT.qs("#cancelCommentBtn")?.addEventListener("click", () => {
      const b = WT.qs("#commentBody");
      if (b) b.value = "";
      const input = WT.qs("#commentImageInput");
      if (input) input.value = "";
      const selectedImagesBox = WT.qs("[data-comment-selected-images]");
      if (selectedImagesBox) {
        selectedImagesBox.replaceChildren();
        selectedImagesBox.hidden = true;
        selectedImagesBox.setAttribute("hidden", "");
      }
      clearUploadProgress(WT.qs("#commentComposer") || document);
      clearCommentDraft();
      setReplyTarget(null);
    });
    WT.qs("#clearReplyBtn")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const body = WT.qs("#commentBody");
      setReplyTarget(null);
      if (body) {
        body.placeholder = "¿Qué opinas sobre esto?";
        try { body.blur(); } catch (_) {}
      }
      document.body.classList.remove("comment-composer-focused", "comment-keyboard-open");
      document.documentElement.classList.remove("comment-composer-focused", "comment-keyboard-open");
      WT.qs("#commentComposer")?.classList.remove("keyboard-open");
      try { event.currentTarget.blur(); } catch (_) {}
      syncCommentComposerKeyboard();
    });
    WT.qs("#clearReplyPreviewBtn")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const body = WT.qs("#commentBody");
      setReplyTarget(null);
      if (body) {
        body.placeholder = "¿Qué opinas sobre esto?";
        try { body.blur(); } catch (_) {}
      }
      document.body.classList.remove("comment-composer-focused", "comment-keyboard-open");
      document.documentElement.classList.remove("comment-composer-focused", "comment-keyboard-open");
      WT.qs("#commentComposer")?.classList.remove("keyboard-open");
      try { event.currentTarget.blur(); } catch (_) {}
      syncCommentComposerKeyboard();
    });

    document.addEventListener("keydown", (e) => {
      const card = e.target.closest?.(".fa-post-card[data-post-url]");
      if (!card || shouldIgnoreCardOpen(e.target)) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = card.dataset.postUrl;
      }
    });

    document.addEventListener("click", (e) => {
      const mentionBtn = e.target.closest("[data-open-username-profile]");
      if (mentionBtn) {
        e.preventDefault();
        e.stopPropagation();
        openUsernameProfile(mentionBtn.dataset.openUsernameProfile || "");
        return;
      }

      const chip = e.target.closest("[data-sidebar-category]");
      if (chip) {
        const select = WT.qs("#forumCategory");
        if (select) {
          select.value = chip.dataset.sidebarCategory;
          listPosts(true);
        }
      }

      const lp = e.target.closest("[data-like-post]");
      if (lp) likePost(lp.dataset.likePost);

      const lc = e.target.closest("[data-like-comment]");
      if (lc) likeComment(lc.dataset.likeComment);

      const rp = e.target.closest("[data-report-post]");
      if (rp) reportTarget({ postId: rp.dataset.reportPost });

      const approvePost = e.target.closest("[data-approve-post]");
      if (approvePost) {
        e.preventDefault();
        e.stopPropagation();
        approveForumPost(approvePost.dataset.approvePost);
        return;
      }

      const delPost = e.target.closest("[data-delete-post]");
      if (delPost) {
        e.preventDefault();
        e.stopPropagation();
        deleteForumPost(delPost.dataset.deletePost);
        return;
      }

      const rc = e.target.closest("[data-report-comment]");
      if (rc) reportTarget({ commentId: rc.dataset.reportComment });

      const approveComment = e.target.closest("[data-approve-comment]");
      if (approveComment) {
        e.preventDefault();
        e.stopPropagation();
        approveForumComment(approveComment.dataset.approveComment);
        return;
      }

      const delComment = e.target.closest("[data-delete-comment]");
      if (delComment) {
        e.preventDefault();
        e.stopPropagation();
        deleteForumComment(delComment.dataset.deleteComment);
        return;
      }

      const blockUserBtn = e.target.closest("[data-block-user]");
      if (blockUserBtn) {
        e.preventDefault();
        e.stopPropagation();
        blockForumUser(blockUserBtn.dataset.blockUser);
        return;
      }

      const reply = e.target.closest("[data-reply-comment]");
      if (reply) {
        setReplyTarget(
          reply.dataset.replyComment,
          reply.dataset.replyAuthor || "comentario",
          reply.dataset.replyBody || "",
          reply.dataset.replyAvatar || "",
          reply.dataset.replyAuthorId || "",
          reply.dataset.replyUsername || ""
        );
      }

      const toggleReplies = e.target.closest("[data-toggle-comment-replies]");
      if (toggleReplies) {
        e.preventDefault();
        const target = WT.qs(`#${CSS.escape(toggleReplies.dataset.repliesTarget || "")}`);
        if (target) {
          const opened = target.classList.toggle("is-collapsed") === false;
          const count = Number(toggleReplies.dataset.repliesCount || 0);
          toggleReplies.setAttribute("aria-expanded", opened ? "true" : "false");
          toggleReplies.textContent = opened
            ? "Ocultar respuestas"
            : (count === 1 ? "Ver 1 respuesta" : `Ver ${count} respuestas`);
        }
        return;
      }

      const share = e.target.closest("[data-share-post]");
      if (share) sharePost(share.dataset.sharePost);

      const pdfSummaryBtn = e.target.closest("[data-open-pdf-summary]");
      if (pdfSummaryBtn) {
        e.preventDefault();
        e.stopPropagation();
        openPdfSummaryModal(pdfSummaryBtn.dataset.openPdfSummary || "");
        return;
      }

      const card = e.target.closest(".fa-post-card[data-post-url]");
      if (card && !shouldIgnoreCardOpen(e.target)) {
        window.location.href = card.dataset.postUrl;
        return;
      }

      const viewerBtn = e.target.closest("[data-open-image-viewer]");
      if (viewerBtn) {
        e.preventDefault();
        e.stopPropagation();
        const gallery = viewerBtn.closest("[data-gallery]");
        let images = [];
        try { images = JSON.parse(decodeURIComponent(gallery?.dataset.gallery || "[]")); } catch (_) {}
        openImageViewer(images, Number(viewerBtn.dataset.imageIndex || 0));
      }
    });
  }

  function syncForumStatusBarTheme() {
    const dark = document.documentElement.classList.contains("wt-forum-dark") || document.documentElement.classList.contains("wt-dark-mode");
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (metaTheme) metaTheme.setAttribute("content", dark ? "#060b14" : "#f3f6fb");
    if (appleStatus) appleStatus.setAttribute("content", "black-translucent");
    document.documentElement.style.backgroundColor = dark ? "#060b14" : "#f3f6fb";
    document.body.style.backgroundColor = dark ? "#060b14" : "#f3f6fb";
  }

  document.addEventListener("DOMContentLoaded", async () => {
    syncForumStatusBarTheme();
    bindPublicProfileTriggers(document.body);
    if (!["forum", "post"].includes(WT.page)) return;
    bindForumEvents();
    await loadCategories();
    if (WT.page === "forum") {
      await updateQuickComposerAvatar();
      await listPosts(true);
    }
    if (WT.page === "post") {
      await updateQuickComposerAvatar();
      await loadPostDetail();
      restoreCommentDraft();
      syncCommentComposerKeyboard();
    }
  });

  window.WTForum = { loadCategories, listPosts, loadPostDetail, loadComments, createPostModal };
})();
