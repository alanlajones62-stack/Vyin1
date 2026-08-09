// ============================================================
// modal.js - Modal de historia a pantalla completa
// ============================================================

import { getHeaders, getCurrentUser, getToken } from './auth.js';
import { showToast, formatNumber, escapeHtml, getAvatar, formatDate } from './utils.js';
import { likeStory, updateStoryStat, registerView } from './feed.js';

const API_URL = window.location.origin;

let modalCurrentStory = null;

export function initModal() {
    const container = document.getElementById('storyModalContainer');
    if (!container) return;

    container.innerHTML = `
        <div id="storyModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a1a;z-index:500;flex-direction:column;animation:modalIn 0.3s ease;">
            <style>
                @keyframes modalIn { 0% { opacity:0; transform:scale(0.96); } 100% { opacity:1; transform:scale(1); } }
                #storyModal .modal-top { display:flex; align-items:center; justify-content:space-between; padding:8px 14px; background:rgba(0,0,0,0.5); flex-shrink:0; z-index:6; }
                #storyModal .modal-top .user { display:flex; align-items:center; gap:8px; cursor:pointer; }
                #storyModal .modal-top .user img { width:30px; height:30px; border-radius:50%; object-fit:cover; border:1.5px solid #c084fc; }
                #storyModal .modal-top .user .name { font-weight:600; font-size:13px; color:#fff; }
                #storyModal .modal-top .user .handle { font-size:10px; color:rgba(255,255,255,0.3); }
                #storyModal .modal-top .close-btn { background:rgba(255,255,255,0.06); border:none; color:#fff; width:30px; height:30px; border-radius:50%; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
                #storyModal .modal-body { flex:1; display:flex; flex-direction:column; min-height:0; position:relative; }
                #storyModal .modal-content { flex:1; display:flex; align-items:center; justify-content:center; padding:8px; background:#0a0a1a; min-height:0; overflow:hidden; }
                #storyModal .modal-content img, #storyModal .modal-content video { max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; }
                #storyModal .modal-content .text-content { text-align:center; padding:20px; font-size:18px; color:#fff; line-height:1.5; width:100%; min-height:200px; display:flex; align-items:center; justify-content:center; }
                #storyModal .modal-sidebar { background:rgba(20,20,35,0.7); backdrop-filter:blur(10px); padding:10px 14px; border-top:1px solid rgba(255,255,255,0.03); flex-shrink:0; max-height:50vh; overflow-y:auto; }
                #storyModal .modal-sidebar .caption { font-size:13px; color:rgba(255,255,255,0.7); margin-bottom:4px; }
                #storyModal .modal-sidebar .stats { display:flex; gap:12px; font-size:12px; color:rgba(255,255,255,0.3); padding:4px 0; }
                #storyModal .modal-sidebar .actions { display:flex; gap:4px; flex-wrap:wrap; padding:4px 0; }
                #storyModal .modal-sidebar .actions button { padding:4px 12px; border-radius:30px; border:none; cursor:pointer; font-weight:500; font-size:11px; display:flex; align-items:center; gap:4px; font-family:inherit; transition:all 0.2s; }
                #storyModal .modal-sidebar .actions button:active { transform:scale(0.92); }
                .modal-like-btn { background:rgba(255,68,68,0.12); color:#ff6b6b; }
                .modal-like-btn.liked { background:#ff6b6b; color:#fff; }
                .modal-comment-btn { background:rgba(192,132,252,0.12); color:#c084fc; }
                #storyModal .modal-sidebar .comments { margin-top:6px; border-top:1px solid rgba(255,255,255,0.04); padding-top:6px; }
                #storyModal .modal-sidebar .comments .input-area { display:flex; gap:4px; padding:4px 0; }
                #storyModal .modal-sidebar .comments .input-area input { flex:1; padding:6px 10px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); border-radius:30px; color:#fff; font-size:12px; font-family:inherit; }
                #storyModal .modal-sidebar .comments .input-area input:focus { outline:none; border-color:rgba(192,132,252,0.2); }
                #storyModal .modal-sidebar .comments .input-area button { padding:6px 12px; background:linear-gradient(135deg,#c084fc,#db2777); border:none; border-radius:30px; color:#fff; font-weight:600; cursor:pointer; font-size:12px; }
                .comment-item { display:flex; gap:8px; padding:4px 0; font-size:12px; border-bottom:1px solid rgba(255,255,255,0.02); }
                .comment-item .c-avatar { width:24px; height:24px; border-radius:50%; object-fit:cover; flex-shrink:0; }
                .comment-item .c-body .c-name { font-weight:600; color:rgba(255,255,255,0.7); }
                .comment-item .c-body .c-text { color:rgba(255,255,255,0.6); }
            </style>
            <div class="modal-top">
                <div class="user" id="modalUser">
                    <img id="modalAvatar" src="" alt="" />
                    <div>
                        <div class="name" id="modalName">Usuario</div>
                        <div class="handle" id="modalHandle">@usuario</div>
                    </div>
                </div>
                <button class="close-btn" onclick="window.closeStoryModalFull()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="modal-content" id="modalContent">
                    <div class="text-content" style="color:rgba(255,255,255,0.2);">
                        <i class="fas fa-spinner fa-pulse" style="font-size:28px;"></i>
                    </div>
                </div>
                <div class="modal-sidebar" id="modalSidebar">
                    <div class="caption" id="modalCaption">Sin descripción</div>
                    <div class="stats">
                        <span><i class="fas fa-eye"></i> <span id="modalViews">0</span></span>
                        <span><i class="fas fa-heart"></i> <span id="modalLikes">0</span></span>
                        <span><i class="fas fa-comment"></i> <span id="modalComments">0</span></span>
                    </div>
                    <div class="actions">
                        <button class="modal-like-btn" id="modalLikeBtn" onclick="window.toggleModalLike()">
                            <i class="fas fa-heart"></i> <span id="modalLikeText">Me gusta</span>
                        </button>
                        <button class="modal-comment-btn" onclick="document.getElementById('modalCommentInput').focus()">
                            <i class="fas fa-comment"></i> Comentar
                        </button>
                    </div>
                    <div class="comments">
                        <div id="modalCommentsList" style="max-height:100px;overflow-y:auto;font-size:12px;">
                            <div style="color:rgba(255,255,255,0.2);text-align:center;padding:8px 0;">Sin comentarios</div>
                        </div>
                        <div class="input-area">
                            <input type="text" id="modalCommentInput" placeholder="Comentario..." onkeypress="if(event.key==='Enter') window.submitModalComment()" />
                            <button onclick="window.submitModalComment()"><i class="fas fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function openStoryModal(storyId) {
    if (!storyId) {
        showToast('Error: historia no identificada', true);
        return;
    }

    const modal = document.getElementById('storyModal');
    if (!modal) return;

    const localStories = window.getStories ? window.getStories() : [];
    let story = localStories.find(s => s.id === storyId);

    if (story) {
        openModalWithStory(story);
    } else {
        fetchStoryFromAPI(storyId);
    }
}

function openModalWithStory(story) {
    modalCurrentStory = story;
    renderModalStory();
    document.getElementById('storyModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    registerView(story.id);
}

async function fetchStoryFromAPI(storyId) {
    try {
        const token = getToken();
        const res = await fetch(`${API_URL}/api/stories/${storyId}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('Historia no encontrada');
        const story = await res.json();
        openModalWithStory(story);
    } catch (error) {
        showToast('Error al cargar la historia', true);
    }
}

export function renderModalStory() {
    if (!modalCurrentStory) return;

    const story = modalCurrentStory;
    const user = story.userData || story.user || {
        id: story.userId,
        username: story.username || 'usuario',
        fullName: story.fullName || 'Usuario',
        avatar: story.avatar || getAvatar(story.fullName || 'U')
    };

    document.getElementById('modalAvatar').src = user.avatar || getAvatar(user.fullName);
    document.getElementById('modalName').textContent = user.fullName;
    document.getElementById('modalHandle').textContent = `@${user.username}`;

    document.getElementById('modalCaption').textContent = story.caption || 'Sin descripción';

    document.getElementById('modalViews').textContent = formatNumber(story.views?.length || 0);
    document.getElementById('modalLikes').textContent = formatNumber(story.likes?.length || 0);
    document.getElementById('modalComments').textContent = formatNumber(story.comments?.length || 0);

    const currentUser = getCurrentUser();
    const isLiked = story.likes?.includes(currentUser?.id) || false;
    const likeBtn = document.getElementById('modalLikeBtn');
    const likeText = document.getElementById('modalLikeText');
    if (isLiked) {
        likeBtn.classList.add('liked');
        likeText.textContent = 'Quitar like';
    } else {
        likeBtn.classList.remove('liked');
        likeText.textContent = 'Me gusta';
    }

    const content = document.getElementById('modalContent');
    if (story.mediaType === 'image' && story.mediaUrl) {
        content.innerHTML = `<img src="${escapeHtml(story.mediaUrl)}" onerror="this.src='https://placehold.co/800x600/1a1a2e/c084fc?text=Imagen'" />`;
    } else if (story.mediaType === 'video' && story.mediaUrl) {
        content.innerHTML = `<video src="${escapeHtml(story.mediaUrl)}" controls autoplay muted></video>`;
    } else if (story.mediaType === 'audio' && story.mediaUrl) {
        content.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px;">
                <i class="fas fa-music" style="font-size:40px;color:#c084fc;"></i>
                <audio controls src="${escapeHtml(story.mediaUrl)}" autoplay style="width:100%;"></audio>
            </div>
        `;
    } else if (story.mediaType === 'text' && story.textContent) {
        content.innerHTML = `
            <div class="text-content" style="background:${escapeHtml(story.textBgColor || '#1a1a2e')}">
                ${escapeHtml(story.textContent)}
            </div>
        `;
    } else {
        content.innerHTML = `
            <div class="text-content" style="background:#1a1a2e;">
                <i class="fas fa-book-open" style="color:#c084fc;"></i> Historia
            </div>
        `;
    }

    renderModalComments(story.comments || []);
}

export function renderModalComments(comments) {
    const container = document.getElementById('modalCommentsList');
    if (!container) return;

    if (!comments || comments.length === 0) {
        container.innerHTML = '<div style="color:rgba(255,255,255,0.2);text-align:center;padding:8px 0;">Sin comentarios</div>';
        return;
    }

    container.innerHTML = comments.map(c => `
        <div class="comment-item">
            <img class="c-avatar" src="${c.avatar || getAvatar(c.fullName || c.username)}" alt="" />
            <div class="c-body">
                <span class="c-name">${escapeHtml(c.fullName || c.username)}</span>
                <span class="c-text">${escapeHtml(c.content)}</span>
            </div>
        </div>
    `).join('');
}

export function closeStoryModalFull() {
    const modal = document.getElementById('storyModal');
    if (modal) {
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
}

export function toggleModalLike() {
    if (!modalCurrentStory) return;
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showToast('Inicia sesión para dar like', true);
        return;
    }

    const isLiked = modalCurrentStory.likes?.includes(currentUser.id) || false;
    const storyId = modalCurrentStory.id;

    if (isLiked) {
        modalCurrentStory.likes = modalCurrentStory.likes.filter(id => id !== currentUser.id);
    } else {
        if (!modalCurrentStory.likes) modalCurrentStory.likes = [];
        modalCurrentStory.likes.push(currentUser.id);
    }

    const newCount = modalCurrentStory.likes.length;
    document.getElementById('modalLikes').textContent = formatNumber(newCount);
    const likeBtn = document.getElementById('modalLikeBtn');
    const likeText = document.getElementById('modalLikeText');
    if (!isLiked) {
        likeBtn.classList.add('liked');
        likeText.textContent = 'Quitar like';
    } else {
        likeBtn.classList.remove('liked');
        likeText.textContent = 'Me gusta';
    }

    updateStoryStat(storyId, 'likes', newCount);
    likeStory(storyId);
}

export function submitModalComment() {
    const input = document.getElementById('modalCommentInput');
    if (!input) return;
    const content = input.value.trim();
    if (!content) {
        showToast('Escribe un comentario', true);
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para comentar', true);
        return;
    }

    if (!modalCurrentStory) return;

    const storyId = modalCurrentStory.id;

    fetch(`${API_URL}/api/stories/${storyId}/comments`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
    })
    .then(res => res.json())
    .then(data => {
        if (data.id) {
            if (!modalCurrentStory.comments) modalCurrentStory.comments = [];
            modalCurrentStory.comments.push(data);
            renderModalComments(modalCurrentStory.comments);
            document.getElementById('modalComments').textContent = formatNumber(modalCurrentStory.comments.length);
            input.value = '';
            showToast('💬 Comentario publicado', false);
        }
    })
    .catch(() => showToast('Error al comentar', true));
}

export function navigateModalStory(direction) {}