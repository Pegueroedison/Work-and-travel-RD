(() => {
  const view = () => WT.qs("#adminView");
  let filter = "pending";
  let currentProfile = null;

  function header() {
    WT.qs("#adminTitle").textContent = "Moderación del foro";
    const btn = WT.qs("#adminCreateBtn");
    btn.classList.add("hidden");
    btn.onclick = null;
  }

  function selectHTML(id, options, value = "") {
    return `<select class="input" id="${id}">${options.map(o => `<option value="${WT.escapeHTML(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${WT.escapeHTML(o.label)}</option>`).join("")}</select>`;
  }

  async function renderModeration() {
    header();
    const myProfile = await WT.getMyProfile();
    currentProfile = myProfile || null;
    const canEditForumSettings = ["admin", "superadmin", "owner"].includes(myProfile?.role);
    const canBulkDelete = ["superadmin", "owner"].includes(myProfile?.role);
    view().innerHTML = `<div class="admin-forum-layout">
      ${canEditForumSettings ? `<section class="admin-tool-card">
        <h3>Configuración del foro</h3>
        <p>Controla la aprobación del foro. Las imágenes siempre se verifican con NSFWJS local; puedes dejar que las limpias publiquen directo o mandar todas las imágenes a moderación manual. Moderador, Administrador y Director siempre publican aprobado.</p>
        <form id="forumSettingsForm" class="admin-inline-form">
          <label>Publicaciones de usuarios
            ${selectHTML("forumApprovalMode", [
              { value: "all_approval", label: "Todo requiere aprobación" },
              { value: "verified_images", label: "Texto/PDF directo; imágenes verificadas contra desnudos" },
              { value: "text_free_images_pending", label: "Texto/PDF directo; todas las imágenes a moderación" }
            ])}
          </label>
          <button class="btn btn-primary btn-small">Guardar</button>
        </form>
      </section>` : ""}

      ${canBulkDelete ? `<section class="admin-tool-card danger-zone-soft">
        <h3>Limpieza masiva</h3>
        <p>Solo Dirección puede usar esta herramienta. Los demás roles autorizados eliminan contenido uno por uno.</p>
        <form id="forumBulkDeleteForm" class="admin-bulk-grid">
          <label>Usuario
            <select class="input" name="user_id" id="bulkUserSelect"><option value="">Todos los usuarios</option></select>
          </label>
          <label>Contenido
            <select class="input" name="target"><option value="posts">Publicaciones</option><option value="comments">Comentarios</option><option value="both">Publicaciones y comentarios</option></select>
          </label>
          <label>Rango
            <select class="input" name="mode" id="bulkMode"><option value="last_hours">Últimas horas</option><option value="before_date">Antes de una fecha</option><option value="date_range">Entre fechas</option><option value="all_user">Todo de ese usuario</option></select>
          </label>
          <label class="bulk-hours">Horas
            <input class="input" type="number" name="hours" min="1" value="24">
          </label>
          <label class="bulk-from hidden">Desde
            <input class="input" type="datetime-local" name="from_date">
          </label>
          <label class="bulk-to hidden">Hasta / Antes de
            <input class="input" type="datetime-local" name="to_date">
          </label>
          <button class="btn btn-danger">Eliminar contenido</button>
        </form>
      </section>` : ""}

      <section class="admin-tool-card">
        <h3>Moderación</h3>
        <div class="toolbar-card compact-toolbar">
          <select class="input" id="forumAdminFilter">
            <option value="pending">Publicaciones pendientes</option>
            <option value="approved">Publicaciones aprobadas</option>
            <option value="comments_pending">Comentarios pendientes</option>
            <option value="comments_all">Todos los comentarios</option>
            <option value="reported">Reportadas</option>
            <option value="all">Todas las publicaciones</option>
          </select>
          <input class="input" id="forumAdminSearch" placeholder="Buscar por título, publicación o comentario">
        </div>
        <div id="forumAdminList" class="admin-card-list"></div>
      </section>
    </div>`;

    WT.qs("#forumAdminFilter").value = filter;
    WT.qs("#forumAdminFilter").addEventListener("change", e => { filter = e.target.value; loadForumItems(); });
    WT.qs("#forumAdminSearch").addEventListener("input", loadForumItems);
    WT.qs("#forumSettingsForm")?.addEventListener("submit", saveForumSettings);
    WT.qs("#forumBulkDeleteForm")?.addEventListener("submit", bulkDeleteContent);
    WT.qs("#bulkMode")?.addEventListener("change", syncBulkFields);
    syncBulkFields();
    await Promise.all([canEditForumSettings ? loadForumSettings() : Promise.resolve(), canBulkDelete ? loadBulkUsers() : Promise.resolve()]);
    await loadForumItems();
  }

  async function loadForumSettings() {
    const { data } = await WT.supabase
      .from("site_settings")
      .select("key,value")
      .in("key", ["forum_require_approval", "forum_media_require_approval"]);
    const values = Object.fromEntries((data || []).map(item => [item.key, String(item.value)]));
    const requireAll = values.forum_require_approval !== "false";
    const mediaPending = values.forum_media_require_approval === "true";
    const select = WT.qs("#forumApprovalMode");
    if (select) select.value = requireAll ? "all_approval" : (mediaPending ? "text_free_images_pending" : "verified_images");
  }

  async function saveForumSettings(e) {
    e.preventDefault();
    const mode = WT.qs("#forumApprovalMode")?.value || "all_approval";
    const rows = [
      {
        key: "forum_require_approval",
        value: mode === "all_approval" ? "true" : "false",
        type: "boolean",
        description: mode === "all_approval" ? "Usuarios normales requieren aprobación en el foro." : "Texto/PDF directo. Las imágenes se verifican con NSFWJS local antes de decidir.",
        is_public: true,
        updated_at: new Date().toISOString()
      },
      {
        key: "forum_media_require_approval",
        value: mode === "text_free_images_pending" ? "true" : "false",
        type: "boolean",
        description: "Si está activo, todas las imágenes quedan pendientes. Si está apagado, solo las imágenes dudosas/NSFW quedan pendientes o bloqueadas.",
        is_public: true,
        updated_at: new Date().toISOString()
      }
    ];
    const { error } = await WT.supabase.from("site_settings").upsert(rows, { onConflict: "key" });
    if (error) return WT.toast(error.message, "error");
    await WTAdminContent.log("actualizar_configuracion_foro", "site_settings", null, { mode, rows });
    WT.toast("Configuración del foro guardada", "success");
  }

  async function loadBulkUsers() {
    const select = WT.qs("#bulkUserSelect");
    if (!select) return;
    const { data } = await WT.supabase.from("user_profiles").select("id,full_name,email,role,status").order("full_name", { ascending: true }).limit(300);
    select.innerHTML = `<option value="">Todos los usuarios</option>` + (data || []).map(u => `<option value="${WT.escapeHTML(u.id)}">${WT.escapeHTML(u.full_name || u.email || u.id)}${u.role ? ` · ${WT.escapeHTML(u.role)}` : ""}</option>`).join("");
  }

  function syncBulkFields() {
    const mode = WT.qs("#bulkMode")?.value || "last_hours";
    WT.qs(".bulk-hours")?.classList.toggle("hidden", mode !== "last_hours");
    WT.qs(".bulk-from")?.classList.toggle("hidden", mode !== "date_range");
    WT.qs(".bulk-to")?.classList.toggle("hidden", !["before_date", "date_range"].includes(mode));
  }

  async function loadForumItems() {
    const list = WT.qs("#forumAdminList"); if (!list) return;
    const search = WT.qs("#forumAdminSearch")?.value?.trim() || "";
    let data = [];
    if (filter === "reported") {
      const res = await WT.supabase.from("forum_reports").select("*, forum_posts(title), forum_comments(body)").eq("status", "pending").order("created_at", { ascending: false }).limit(80);
      if (res.error) return list.innerHTML = `<div class="empty-state">${WT.escapeHTML(res.error.message)}</div>`;
      data = res.data || [];
      list.innerHTML = data.length ? data.map(renderReport).join("") : `<div class="empty-state">No hay reportes pendientes.</div>`;
      return;
    }

    if (filter.startsWith("comments")) {
      let q = WT.supabase.from("forum_comments").select("*, forum_posts(title)").order("created_at", { ascending: false }).limit(80);
      if (filter === "comments_pending") q = q.eq("status", "pending");
      if (search) q = q.ilike("body", `%${search}%`);
      const res = await q;
      if (res.error) return list.innerHTML = `<div class="empty-state">${WT.escapeHTML(res.error.message)}</div>`;
      data = await WTContent.hydrateAuthors(res.data || []);
      list.innerHTML = data.length ? data.map(renderComment).join("") : `<div class="empty-state">No hay comentarios.</div>`;
      return;
    }

    let q = WT.supabase.from("forum_posts").select("*, forum_categories(name)").order("created_at", { ascending: false }).limit(80);
    if (filter !== "all") q = q.eq("status", filter);
    if (search) q = q.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
    const res = await q;
    if (res.error) return list.innerHTML = `<div class="empty-state">${WT.escapeHTML(res.error.message)}</div>`;
    data = await WTContent.hydrateAuthors(res.data || []);
    list.innerHTML = data.length ? data.map(renderPost).join("") : `<div class="empty-state">No hay publicaciones.</div>`;
  }

  function deleteWindowHoursForRole(role = "user") {
    const r = String(role || "user").toLowerCase();
    if (r === "owner") return Infinity;
    if (r === "superadmin") return 48;
    if (r === "admin") return 24;
    if (r === "moderator" || r === "moderador") return 5;
    return 0;
  }

  function isRecentEnoughToDelete(item) {
    const created = item?.created_at ? new Date(item.created_at).getTime() : 0;
    if (!created) return false;
    const hours = deleteWindowHoursForRole(currentProfile?.role);
    return hours === Infinity || (hours > 0 && Date.now() - created <= hours * 60 * 60 * 1000);
  }

  function canDeleteForumItem(item) {
    const role = String(currentProfile?.role || "user").toLowerCase();
    if (role === "owner") return true;
    if (["moderator", "moderador", "admin", "superadmin"].includes(role)) return item.status !== "approved" || isRecentEnoughToDelete(item);
    return false;
  }

  function moderationNote(item) {
    if (currentProfile?.role === "moderator" && item.status === "approved" && !isRecentEnoughToDelete(item)) {
      return `<span class="admin-muted-note">Moderador: solo lectura. Esta publicación aprobada tiene fuera del tiempo permitido.</span>`;
    }
    return "";
  }

  function renderPost(p) {
    const canDelete = canDeleteForumItem(p);
    const deleteButton = canDelete ? `<button class="btn btn-danger btn-small" data-delete-post="${p.id}">${p.status === "pending" ? "Rechazar y borrar" : "Eliminar"}</button>` : moderationNote(p);
    return `<article class="admin-record admin-forum-record"><h3>${WT.escapeHTML(p.title)}</h3><p>${WT.escapeHTML((p.body || "").slice(0, 220))}</p><p><strong>Categoría:</strong> ${WT.escapeHTML(p.forum_categories?.name || "")} • <strong>Estado:</strong> ${WT.escapeHTML(p.status)} • <strong>Autor:</strong> ${WT.escapeHTML(p.author?.full_name || p.author_id)} • ${WT.formatDate(p.created_at)}</p><div class="record-actions"><a class="btn btn-soft btn-small" href="post.html?id=${p.id}" target="_blank">Ver publicación</a>${p.status !== "approved" ? `<button class="btn btn-success btn-small" data-approve-post="${p.id}">Aprobar</button>` : ""}${deleteButton}</div></article>`;
  }

  function renderComment(c) {
    const author = c.author || {};
    const canDelete = canDeleteForumItem(c);
    const oldApprovedNote = currentProfile?.role === "moderator" && c.status === "approved" && !isRecentEnoughToDelete(c)
      ? `<span class="admin-muted-note">Moderador: solo lectura. Este comentario aprobado tiene fuera del tiempo permitido.</span>` : "";
    const deleteButton = canDelete ? `<button class="btn btn-danger btn-small" data-delete-comment="${c.id}">${c.status === "pending" ? "Rechazar y borrar" : "Eliminar"}</button>` : oldApprovedNote;
    return `<article class="admin-record admin-forum-record"><h3>Comentario en: ${WT.escapeHTML(c.forum_posts?.title || "Publicación")}</h3><p>${WT.escapeHTML((c.body || "").slice(0, 260))}</p><p><strong>Estado:</strong> ${WT.escapeHTML(c.status)} • <strong>Autor:</strong> ${WT.escapeHTML(author.full_name || c.author_id)} • ${WT.formatDate(c.created_at)}</p><div class="record-actions">${c.post_id ? `<a class="btn btn-soft btn-small" href="post.html?id=${c.post_id}" target="_blank">Ver publicación</a>` : ""}${c.status !== "approved" ? `<button class="btn btn-success btn-small" data-approve-comment="${c.id}">Aprobar</button>` : ""}${deleteButton}</div></article>`;
  }

  function renderReport(r) {
    const title = r.forum_posts?.title || r.forum_comments?.body || "Contenido reportado";
    const canDeleteReported = ["admin", "superadmin", "owner"].includes(currentProfile?.role);
    return `<article class="admin-record admin-forum-record"><h3>${WT.escapeHTML(title)}</h3><p><strong>Motivo:</strong> ${WT.escapeHTML(r.reason)}</p><p><strong>Tipo:</strong> ${WT.escapeHTML(r.target_type)} • ${WT.formatDate(r.created_at)}</p><div class="record-actions">${r.post_id ? `<a class="btn btn-soft btn-small" href="post.html?id=${r.post_id}" target="_blank">Ver</a>` : ""}<button class="btn btn-success btn-small" data-resolve-report="${r.id}">Marcar revisado</button>${canDeleteReported ? `<button class="btn btn-danger btn-small" data-delete-reported="${r.target_type}:${r.post_id || r.comment_id}:${r.id}">Eliminar contenido</button>` : `<span class="admin-muted-note">Moderador: revisa el reporte y elimina solo desde la lista si el contenido cumple la regla de tiempo del rol.</span>`}</div></article>`;
  }


  const MEDIA_COLUMNS = "id,status,created_at,image_url,image_path,image_key,attachments,pdf_attachments";

  async function selectWithMedia(table, id = null, extra = "") {
    let q = WT.supabase.from(table).select(extra || MEDIA_COLUMNS);
    if (id) q = q.eq("id", id).maybeSingle();
    const res = await q;
    return res;
  }

  async function deleteImagesForPost(post) {
    if (!post?.id) return;
    const records = [post];
    const { data: comments } = await WT.supabase
      .from("forum_comments")
      .select(MEDIA_COLUMNS)
      .eq("post_id", post.id);
    records.push(...(comments || []));
    await WT.deleteR2ImagesFromRecords(records);
    if (WT.deleteGoogleDrivePdfsFromRecords) await WT.deleteGoogleDrivePdfsFromRecords(records);
  }

  async function deleteImagesForComment(comment) {
    if (!comment) return;
    await WT.deleteR2ImagesFromRecords([comment]);
    if (WT.deleteGoogleDrivePdfsFromRecords) await WT.deleteGoogleDrivePdfsFromRecords([comment]);
  }

  async function approvePost(id) {
    if (!id) return;
    const btn = document.querySelector(`[data-approve-post="${CSS.escape(String(id))}"]`);
    const oldText = btn?.textContent || "Aprobar";
    if (btn) { btn.disabled = true; btn.textContent = "Aprobando..."; }
    try {
      const result = await WTAdminContent.adminQuery(async () => {
        const rpc = await WT.supabase.rpc("approve_forum_post_v4050", { post_id: id });
        if (!rpc.error) return rpc;
        const legacy = await WT.supabase.rpc("approve_forum_post", { post_id: id });
        if (!legacy.error) return legacy;
        return WT.supabase
          .from("forum_posts")
          .update({ status: "approved", approved_by: currentProfile?.id || null, approved_at: new Date().toISOString() })
          .eq("id", id)
          .select("id,status")
          .maybeSingle();
      });
      if (result?.error) throw result.error;

      const verify = await WT.supabase.from("forum_posts").select("id,status").eq("id", id).maybeSingle();
      if (verify.error) throw verify.error;
      if (!verify.data || verify.data.status !== "approved") throw new Error("Supabase no confirmó la aprobación de la publicación.");

      await WTAdminContent.log("aprobar_publicacion", "forum_posts", id);
      WT.toast("Publicación aprobada", "success");
      await loadForumItems();
    } catch (error) {
      WT.toast(error.message || "No se pudo aprobar la publicación", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }

  async function approveComment(id) {
    if (!id) return;
    const btn = document.querySelector(`[data-approve-comment="${CSS.escape(String(id))}"]`);
    const oldText = btn?.textContent || "Aprobar";
    if (btn) { btn.disabled = true; btn.textContent = "Aprobando..."; }
    try {
      const result = await WTAdminContent.adminQuery(async () => {
        const rpc = await WT.supabase.rpc("approve_forum_comment_v4050", { comment_id: id });
        if (!rpc.error) return rpc;
        return WT.supabase
          .from("forum_comments")
          .update({ status: "approved", approved_by: currentProfile?.id || null, approved_at: new Date().toISOString() })
          .eq("id", id)
          .select("id,status")
          .maybeSingle();
      });
      if (result?.error) throw result.error;

      const verify = await WT.supabase.from("forum_comments").select("id,status").eq("id", id).maybeSingle();
      if (verify.error) throw verify.error;
      if (!verify.data || verify.data.status !== "approved") throw new Error("Supabase no confirmó la aprobación del comentario.");

      await WTAdminContent.log("aprobar_comentario", "forum_comments", id);
      WT.toast("Comentario aprobado", "success");
      await loadForumItems();
    } catch (error) {
      WT.toast(error.message || "No se pudo aprobar el comentario", "error");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }
  async function deletePost(id) {
    const { data: item, error: readError } = await WT.supabase.from("forum_posts").select(MEDIA_COLUMNS).eq("id", id).maybeSingle();
    if (readError) return WT.toast(readError.message, "error");
    if (item && !canDeleteForumItem(item)) return WT.toast("No puedes eliminar esta publicación porque ya pasó el tiempo permitido para tu rol.", "warning");
    const ok = await WT.confirmDialog({ title: "Eliminar publicación", message: "Se eliminará la publicación y sus archivos adjuntos.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    await deleteImagesForPost(item);
    const { error } = await WT.supabase.from("forum_posts").delete().eq("id", id);
    if (error) return WT.toast(error.message, "error");
    await WTAdminContent.log("eliminar_publicacion", "forum_posts", id); WT.toast("Publicación y archivos externos eliminados", "success"); loadForumItems();
  }
  async function deleteComment(id) {
    const { data: item, error: readError } = await WT.supabase.from("forum_comments").select(MEDIA_COLUMNS).eq("id", id).maybeSingle();
    if (readError) return WT.toast(readError.message, "error");
    if (item && !canDeleteForumItem(item)) return WT.toast("No puedes eliminar este comentario porque ya pasó el tiempo permitido para tu rol.", "warning");
    const ok = await WT.confirmDialog({ title: "Eliminar comentario", message: "Se borrará el comentario y también sus imágenes/PDF externos.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    await deleteImagesForComment(item);
    const { error } = await WT.supabase.from("forum_comments").delete().eq("id", id);
    if (error) return WT.toast(error.message, "error");
    try { await WT.supabase.rpc("sync_drive_storage_counters"); } catch (_) {}
    await WTAdminContent.log("eliminar_comentario", "forum_comments", id); WT.toast("Comentario y archivos externos eliminados", "success"); loadForumItems();
  }
  async function resolveReport(id) {
    const { error } = await WT.supabase.from("forum_reports").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", id);
    if (error) return WT.toast(error.message, "error");
    WT.toast("Reporte marcado como revisado", "success"); loadForumItems();
  }
  async function deleteReported(ref) {
    const [type, targetId, reportId] = ref.split(":");
    const table = type === "post" ? "forum_posts" : "forum_comments";
    const ok = await WT.confirmDialog({ title: "Eliminar contenido reportado", message: "Se eliminará el contenido reportado y el reporte quedará marcado como revisado.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    const { data: item } = await WT.supabase.from(table).select(MEDIA_COLUMNS).eq("id", targetId).maybeSingle();
    if (type === "post") await deleteImagesForPost(item);
    else await deleteImagesForComment(item);
    const { error } = await WT.supabase.from(table).delete().eq("id", targetId);
    if (error) return WT.toast(error.message, "error");
    await WT.supabase.from("forum_reports").update({ status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", reportId);
    await WTAdminContent.log("eliminar_contenido_reportado", table, targetId); WT.toast("Contenido e imágenes eliminados", "success"); loadForumItems();
  }

  function validateBulkFilters(fd) {
    const userId = fd.get("user_id");
    const mode = fd.get("mode");
    if (mode === "before_date" && !fd.get("to_date")) throw new Error("Selecciona la fecha límite.");
    if (mode === "date_range" && (!fd.get("from_date") || !fd.get("to_date"))) throw new Error("Selecciona fecha desde y hasta.");
    if (mode === "all_user" && !userId) throw new Error("Para borrar todo, primero selecciona un usuario.");
  }

  function applyBulkFilters(query, fd) {
    const userId = fd.get("user_id");
    const mode = fd.get("mode");
    if (userId) query = query.eq("author_id", userId);
    if (mode === "last_hours") {
      const hours = Math.max(1, Number(fd.get("hours") || 24));
      const from = new Date(Date.now() - hours * 3600000).toISOString();
      query = query.gte("created_at", from);
    } else if (mode === "before_date") {
      query = query.lte("created_at", new Date(fd.get("to_date")).toISOString());
    } else if (mode === "date_range") {
      query = query.gte("created_at", new Date(fd.get("from_date")).toISOString()).lte("created_at", new Date(fd.get("to_date")).toISOString());
    }
    return query;
  }

  async function deleteFromTable(table, fd) {
    let read = WT.supabase.from(table).select(table === "forum_posts" ? MEDIA_COLUMNS : `${MEDIA_COLUMNS},post_id`);
    read = applyBulkFilters(read, fd);
    const { data: rows, error: readError } = await read;
    if (readError) throw readError;

    if (table === "forum_posts") {
      for (const post of (rows || [])) await deleteImagesForPost(post);
    } else {
      await WT.deleteR2ImagesFromRecords(rows || []);
      if (WT.deleteGoogleDrivePdfsFromRecords) await WT.deleteGoogleDrivePdfsFromRecords(rows || []);
    }

    const ids = (rows || []).map(row => row.id).filter(Boolean);
    if (!ids.length) return 0;
    const { error } = await WT.supabase.from(table).delete().in("id", ids);
    if (error) throw error;
    try { await WT.supabase.rpc("sync_drive_storage_counters"); } catch (_) {}
    return ids.length;
  }

  async function bulkDeleteContent(e) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const target = fd.get("target");
    try { validateBulkFilters(fd); } catch (err) { return WT.toast(err.message, "error"); }
    const ok = await WT.confirmDialog({ title: "Eliminar contenido masivo", message: "Esta acción borrará definitivamente el contenido que coincida con los filtros.", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    try {
      let posts = 0, comments = 0;
      if (target === "comments" || target === "both") comments = await deleteFromTable("forum_comments", fd);
      if (target === "posts" || target === "both") posts = await deleteFromTable("forum_posts", fd);
      await WTAdminContent.log("eliminar_contenido_masivo", "forum", null, { target, posts, comments, mode: fd.get("mode"), user_id: fd.get("user_id") || null });
      WT.toast(`Eliminado: ${posts} publicaciones y ${comments} comentarios`, "success");
      loadForumItems();
    } catch (err) { WT.toast(err.message, "error"); }
  }


  function formatBytes(bytes = 0) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return "0 MB";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = n; let idx = 0;
    while (value >= 1024 && idx < units.length - 1) { value /= 1024; idx += 1; }
    return `${value >= 10 || idx < 2 ? value.toFixed(0) : value.toFixed(2)} ${units[idx]}`;
  }

  function driveStatusBadge(drive) {
    if (!drive.is_active) return `<span class="drive-status paused">Pausada</span>`;
    if (drive.is_full) return `<span class="drive-status full">Llena</span>`;
    if (Number(drive.error_count || 0) > 0) return `<span class="drive-status warning">Con errores</span>`;
    return `<span class="drive-status ok">Activa</span>`;
  }

  async function loadDriveStorageRows() {
    try {
      try { await WT.supabase.rpc("sync_drive_storage_counters"); } catch (_) {}
      const rpc = await WT.supabase.rpc("get_drive_storage_summary");
      if (!rpc.error && Array.isArray(rpc.data)) return rpc.data;
    } catch (_) {}

    const { data, error } = await WT.supabase
      .from("drive_accounts")
      .select("id,name,upload_url,delete_url,folder_id,max_storage_bytes,used_storage_bytes,is_active,is_full,last_used_at,upload_count,error_count,updated_at")
      .order("id", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  function renderDriveCards(rows = []) {
    const totals = rows.reduce((acc, row) => {
      acc.max += Number(row.max_storage_bytes || row.maxStorageBytes || 0);
      acc.used += Number(row.used_storage_bytes || row.usedStorageBytes || 0);
      acc.files += Number(row.file_count || row.files_count || row.stored_files_count || row.upload_count || 0);
      acc.errors += Number(row.error_count || 0);
      if (row.is_active && !row.is_full) acc.active += 1;
      return acc;
    }, { max: 0, used: 0, files: 0, errors: 0, active: 0 });
    const pct = totals.max ? Math.min(100, Math.round((totals.used / totals.max) * 100)) : 0;
    const free = Math.max(0, totals.max - totals.used);

    const MAX_PDF_BYTES = 5 * 1024 * 1024;

    const cards = rows.map(row => {
      const max = Number(row.max_storage_bytes || row.maxStorageBytes || 0);
      const used = Number(row.used_storage_bytes || row.usedStorageBytes || 0);
      const fileCount = Number(row.file_count || row.files_count || row.stored_files_count || row.upload_count || 0);
      const percent = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
      const fileCapacity = Math.max(1, Math.floor(max / MAX_PDF_BYTES));
      const rawFilePercent = fileCapacity ? (fileCount / fileCapacity) * 100 : 0;
      const filePercent = fileCount > 0 ? Math.max(1, Math.min(100, Math.round(rawFilePercent))) : 0;
      const fileShare = totals.files ? Math.min(100, Math.round((fileCount / totals.files) * 100)) : 0;
      const freeSpace = Math.max(0, max - used);
      const lastUsed = row.last_used_at ? WT.formatDate(row.last_used_at) : "Sin subidas registradas";
      const errors = Number(row.error_count || 0);
      return `<article class="drive-storage-card">
        <div class="drive-card-head">
          <div>
            <h3>${WT.escapeHTML(row.name || row.id)}</h3>
            <p>${WT.escapeHTML(row.id || "")} · ${WT.escapeHTML(row.folder_id || "Sin carpeta")}</p>
          </div>
          ${driveStatusBadge(row)}
        </div>
        <div class="drive-meter" aria-label="${percent}% de almacenamiento usado"><span style="width:${percent}%"></span></div>
        <div class="drive-stats-grid drive-stats-grid-clean">
          <span><strong>${formatBytes(used)}</strong><small>Usado</small></span>
          <span><strong>${formatBytes(freeSpace)}</strong><small>Disponible</small></span>
          <span><strong>${fileCount}</strong><small>Archivos publicados</small></span>
          <span><strong>${percent}%</strong><small>Uso de espacio</small></span>
        </div>
        <div class="drive-file-bar-wrap" aria-label="${fileCount} archivos publicados en esta cuenta">
          <div class="drive-file-bar-head">
            <span>Archivos publicados</span>
            <strong>${fileCount} de ${fileCapacity} estimados</strong>
          </div>
          <div class="drive-file-meter"><span style="width:${filePercent}%"></span></div>
          <small>Uso estimado por archivos adjuntos del foro.</small>
        </div>
        <div class="drive-admin-count-row">
          <span class="drive-count-pill"><b>${fileCount}</b> archivos publicados</span>
          <span class="drive-count-pill ${errors ? "danger" : "ok"}"><b>${errors}</b> errores recientes</span>
        </div>
        <p class="drive-meta"><strong>Última subida:</strong> ${WT.escapeHTML(lastUsed)}</p>
      </article>`;
    }).join("");

    return `<section class="admin-tool-card drive-summary-card">
      <div class="drive-summary-head">
        <div>
          <h3>Resumen de almacenamiento PDF</h3>
          <p>Estos datos se calculan con los archivos registrados por la plataforma. Los archivos subidos manualmente fuera de la web pueden no aparecer aquí.</p>
        </div>
        <button class="btn btn-soft btn-small" id="refreshDriveStorage">Actualizar</button>
      </div>
      <div class="drive-total-grid">
        <div><strong>${rows.length}</strong><span>Cuentas Drive</span></div>
        <div><strong>${totals.active}</strong><span>Activas</span></div>
        <div><strong>${formatBytes(totals.used)}</strong><span>Usado total</span></div>
        <div><strong>${formatBytes(free)}</strong><span>Disponible total</span></div>
        <div><strong>${totals.files}</strong><span>Archivos publicados</span></div>
      </div>
      <div class="drive-global-meter"><span style="width:${pct}%"></span></div>
      <p class="drive-global-note">Uso general: <strong>${pct}%</strong> de ${formatBytes(totals.max || 0)}.</p>
    </section>
    <section class="drive-storage-grid">${cards || `<div class="empty-state">No hay cuentas de almacenamiento configuradas.</div>`}</section>`;
  }

  async function renderDriveStorage() {
    header();
    WT.qs("#adminTitle").textContent = "Almacenamiento";
    const btn = WT.qs("#adminCreateBtn");
    btn.classList.add("hidden");
    btn.onclick = null;
    view().innerHTML = `<div class="admin-forum-layout"><div class="admin-tool-card"><h3>Estado de Google Drive</h3><p>Cargando estado de cuentas, espacio usado, archivos registrados y errores...</p></div></div>`;
    try {
      const rows = await loadDriveStorageRows();
      view().innerHTML = `<div class="admin-forum-layout">${renderDriveCards(rows)}</div>`;
      WT.qs("#refreshDriveStorage")?.addEventListener("click", renderDriveStorage);
    } catch (error) {
      view().innerHTML = `<div class="empty-state">${WT.escapeHTML(error.message || "No se pudo cargar el almacenamiento.")}</div>`;
    }
  }


  document.addEventListener("click", e => {
    const ap = e.target.closest("[data-approve-post]"); if (ap) approvePost(ap.dataset.approvePost);
    const ac = e.target.closest("[data-approve-comment]"); if (ac) approveComment(ac.dataset.approveComment);
    const dp = e.target.closest("[data-delete-post]"); if (dp) deletePost(dp.dataset.deletePost);
    const dc = e.target.closest("[data-delete-comment]"); if (dc) deleteComment(dc.dataset.deleteComment);
    const rr = e.target.closest("[data-resolve-report]"); if (rr) resolveReport(rr.dataset.resolveReport);
    const dr = e.target.closest("[data-delete-reported]"); if (dr) deleteReported(dr.dataset.deleteReported);
  });

  window.WTAdminForum = { renderModeration, renderDriveStorage };
})();
