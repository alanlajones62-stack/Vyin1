// ============================================================
// edit-profile-modal.js - Modal para editar perfil CON TABS Y DOWNGRADE DE EMPRESA
// 🔥 INTEGRADO CON i18n PARA TRADUCCIÓN DE INTERFAZ
// 🔥 CORREGIDO: Duplicación de textos, limpieza de tabs y estado
// ============================================================

import {
    getToken, getCurrentUser, showToast,
    getAvatar, escapeHtml, setCurrentUser
} from './auth.js';

// 🔥 IMPORTAR SISTEMA i18n
import { t, translateAll, onLocaleChange, translateElement, translateElementPlaceholder, setLocale } from './i18n.js';

const API_URL = window.location.origin;
let isEditProfileOpen = false;
let currentUserData = null;
let originalUsername = '';
let isBusinessRequestSent = false;
let saveTimeout = null;
let isSaving = false;
let currentTab = 'profile';

// ============================================================
// INYECTAR ESTILOS
// ============================================================

function injectStyles() {
    const styles = document.createElement('style');
    styles.textContent = `
        .edit-profile-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100dvh;
            background: rgba(10, 10, 26, 0.92);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            z-index: 20000;
            display: none;
            flex-direction: column;
            animation: editProfileFadeIn 0.35s ease;
        }
        .edit-profile-overlay.active { display: flex; }
        
        @keyframes editProfileFadeIn {
            0% { opacity: 0; transform: scale(0.98); }
            100% { opacity: 1; transform: scale(1); }
        }
        
        .edit-profile-content {
            background: #12122a;
            border-radius: 0;
            width: 100%;
            max-width: 100%;
            max-height: 100vh;
            height: 100vh;
            overflow: hidden;
            position: relative;
            border: none;
            box-shadow: none;
            display: flex;
            flex-direction: column;
        }
        
        .edit-profile-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 20px 12px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
            background: transparent;
            min-height: auto;
        }
        .edit-profile-header .back-btn {
            background: rgba(255, 255, 255, 0.05);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            color: rgba(255, 255, 255, 0.5);
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }
        .edit-profile-header .back-btn:active { transform: scale(0.88); }
        .edit-profile-header .title {
            font-weight: 700;
            font-size: 18px;
            color: #fff;
            flex: 1;
            text-align: center;
        }
        .edit-profile-header .save-status {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.2);
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 50px;
            background: rgba(255, 255, 255, 0.04);
            transition: all 0.3s;
        }
        .edit-profile-header .save-status.saving {
            color: #c084fc;
            background: rgba(192, 132, 252, 0.08);
        }
        .edit-profile-header .save-status.saved {
            color: #4ade80;
            background: rgba(34, 197, 94, 0.08);
        }
        .edit-profile-header .save-status i { font-size: 12px; }
        
        /* ===== TABS ===== */
        .edit-profile-tabs {
            display: flex;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding: 0 4px;
            gap: 2px;
        }
        .edit-profile-tabs::-webkit-scrollbar { height: 0; }
        
        .edit-tab-btn {
            padding: 12px 16px;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.4);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            white-space: nowrap;
            position: relative;
            display: flex;
            align-items: center;
            gap: 6px;
            border-bottom: 2px solid transparent;
        }
        .edit-tab-btn i { font-size: 14px; }
        .edit-tab-btn:hover { color: rgba(255, 255, 255, 0.7); }
        .edit-tab-btn.active {
            color: #c084fc;
            border-bottom-color: #c084fc;
        }
        .edit-tab-btn .tab-badge {
            background: rgba(239, 68, 68, 0.15);
            color: #ff6b6b;
            font-size: 10px;
            padding: 1px 6px;
            border-radius: 10px;
            font-weight: 700;
        }
        
        .edit-profile-body {
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px 30px;
            -webkit-overflow-scrolling: touch;
        }
        
        /* ===== TAB CONTENT ===== */
        .tab-content {
            display: none;
            animation: tabFadeIn 0.3s ease;
        }
        .tab-content.active { display: block; }
        
        @keyframes tabFadeIn {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
        }
        
        .edit-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.15);
        }
        .edit-loading i { font-size: 32px; margin-bottom: 12px; }
        
        /* ===== AVATAR SECTION ===== */
        .edit-avatar-section {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 12px 0 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            margin-bottom: 20px;
        }
        .edit-avatar-wrapper { position: relative; flex-shrink: 0; }
        .edit-avatar {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid rgba(192, 132, 252, 0.25);
            background: #1a1a2e;
        }
        .change-avatar-btn {
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: linear-gradient(135deg, #c084fc, #db2777);
            border: 2px solid #12122a;
            color: #fff;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }
        .change-avatar-btn:active { transform: scale(0.88); }
        .edit-avatar-info { flex: 1; min-width: 0; }
        .edit-avatar-info .edit-name {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .edit-avatar-info .edit-name .verified-badge { font-size: 16px; }
        .edit-avatar-info .edit-username { font-size: 14px; color: rgba(255, 255, 255, 0.35); }
        .edit-avatar-info .edit-role {
            font-size: 11px;
            font-weight: 600;
            color: #c084fc;
            background: rgba(192, 132, 252, 0.12);
            padding: 2px 10px;
            border-radius: 12px;
            display: inline-block;
            margin-top: 4px;
        }
        
        .edit-section {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .edit-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
        .edit-section-title {
            font-size: 14px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .edit-section-title i { color: #c084fc; }
        
        .edit-group { margin-bottom: 14px; }
        .edit-group:last-child { margin-bottom: 0; }
        .edit-group label {
            display: block;
            margin-bottom: 5px;
            color: rgba(255, 255, 255, 0.6);
            font-size: 13px;
            font-weight: 500;
        }
        .edit-group label .required { color: #ff6b6b; margin-left: 2px; }
        .edit-group input,
        .edit-group textarea,
        .edit-group select {
            width: 100%;
            padding: 11px 14px;
            background: rgba(255, 255, 255, 0.06);
            border: 2px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            color: #fff;
            font-size: 14px;
            font-family: inherit;
            transition: all 0.25s;
        }
        .edit-group input:focus,
        .edit-group textarea:focus,
        .edit-group select:focus {
            outline: none;
            border-color: #c084fc;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: 0 0 0 3px rgba(192, 132, 252, 0.1);
        }
        .edit-group input::placeholder,
        .edit-group textarea::placeholder { color: rgba(255, 255, 255, 0.25); }
        .edit-group input:disabled,
        .edit-group select:disabled { opacity: 0.5; cursor: not-allowed; }
        .edit-group textarea { resize: vertical; min-height: 60px; }
        .edit-group select {
            appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.3)' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 14px center;
            padding-right: 36px;
        }
        .edit-group select option { background: #1a1a2e; color: #fff; }
        .edit-helper {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.3);
            margin-top: 5px;
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .edit-helper i { font-size: 11px; }
        .edit-helper.warning { color: #fbbf24; }
        .edit-helper.error { color: #ff6b6b; }
        .edit-helper.success { color: #4ade80; }
        
        /* ===== PRIVACY OPTIONS ===== */
        .privacy-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .privacy-option {
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.25s;
            border: 2px solid transparent;
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .privacy-option:hover { background: rgba(192, 132, 252, 0.06); transform: translateX(4px); }
        .privacy-option.active {
            background: rgba(192, 132, 252, 0.1);
            border-color: #c084fc;
            box-shadow: 0 0 20px rgba(192, 132, 252, 0.05);
        }
        .privacy-option .privacy-icon { font-size: 18px; width: 32px; text-align: center; flex-shrink: 0; }
        .privacy-option .privacy-info { flex: 1; }
        .privacy-option .privacy-info .title {
            font-weight: 600;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.8);
        }
        .privacy-option .privacy-info .desc {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.3);
            margin-top: 1px;
        }
        .privacy-option .privacy-check {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
            flex-shrink: 0;
        }
        .privacy-option.active .privacy-check {
            background: linear-gradient(135deg, #c084fc, #db2777);
            border-color: #c084fc;
        }
        .privacy-option.active .privacy-check i { color: #fff; font-size: 11px; }
        
        /* ===== BUSINESS REQUEST ===== */
        .business-request-btn {
            width: 100%;
            padding: 12px;
            background: rgba(251, 191, 36, 0.12);
            border: 2px dashed rgba(251, 191, 36, 0.25);
            border-radius: 12px;
            color: #fbbf24;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .business-request-btn:hover { background: rgba(251, 191, 36, 0.2); border-color: #fbbf24; transform: translateY(-2px); }
        .business-request-btn:active { transform: scale(0.97); }
        
        .business-request-sent {
            background: rgba(34, 197, 94, 0.08);
            border: 1px solid rgba(34, 197, 94, 0.15);
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 4px;
        }
        .business-request-sent i { font-size: 28px; }
        .business-request-sent span { font-size: 15px; font-weight: 600; }
        
        .business-info-display {
            background: rgba(255, 255, 255, 0.04);
            border-radius: 12px;
            padding: 14px 16px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.6);
            line-height: 1.8;
        }
        .business-info-display strong { color: rgba(255, 255, 255, 0.4); }
        
        .account-type-locked {
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            padding: 10px 14px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .account-type-locked i { color: #c084fc; }
        
        .btn-downgrade-business {
            width: 100%;
            padding: 12px;
            background: rgba(239, 68, 68, 0.08);
            border: 2px solid rgba(239, 68, 68, 0.15);
            border-radius: 12px;
            color: #ff6b6b;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 12px;
        }
        .btn-downgrade-business:hover {
            background: rgba(239, 68, 68, 0.15);
            border-color: #ff6b6b;
            transform: translateY(-2px);
        }
        .btn-downgrade-business:active { transform: scale(0.97); }
        .btn-downgrade-business i { font-size: 14px; }
        
        .community-rules-section {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 16px;
            padding: 16px;
            border: 1px solid rgba(255, 255, 255, 0.04);
        }
        .rules-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 16px;
        }
        .rule-item {
            display: flex;
            align-items: flex-start;
            gap: 14px;
            padding: 12px 14px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            transition: all 0.2s ease;
            border: 1px solid transparent;
        }
        .rule-item:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(192, 132, 252, 0.1);
            transform: translateX(4px);
        }
        .rule-icon { font-size: 22px; line-height: 1; flex-shrink: 0; margin-top: 2px; }
        .rule-content { flex: 1; min-width: 0; }
        .rule-title {
            font-weight: 600;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 2px;
        }
        .rule-desc {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            line-height: 1.4;
        }
        .rules-footer {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 16px;
            background: rgba(251, 191, 36, 0.06);
            border-radius: 12px;
            border-left: 3px solid #fbbf24;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            margin-top: 4px;
        }
        .rules-footer i { color: #fbbf24; font-size: 16px; flex-shrink: 0; }
        
        .blocked-list-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .blocked-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 12px;
            transition: all 0.25s;
            border: 1px solid rgba(255, 255, 255, 0.04);
        }
        .blocked-item:hover {
            background: rgba(255, 255, 255, 0.06);
        }
        .blocked-item .user-info {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
            min-width: 0;
        }
        .blocked-item .user-avatar {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            object-fit: cover;
            background: #1a1a2e;
            flex-shrink: 0;
            border: 2px solid rgba(255, 255, 255, 0.06);
        }
        .blocked-item .user-name {
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            font-size: 14px;
        }
        .blocked-item .user-username {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.3);
        }
        .btn-unblock {
            padding: 6px 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 20px;
            color: #ff6b6b;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
        }
        .btn-unblock:hover {
            background: rgba(239, 68, 68, 0.2);
            transform: scale(1.02);
        }
        .btn-unblock:active { transform: scale(0.95); }
        .btn-unblock i { font-size: 11px; margin-right: 4px; }
        
        .blocked-empty {
            text-align: center;
            padding: 40px 20px;
            color: rgba(255, 255, 255, 0.2);
        }
        .blocked-empty i { font-size: 40px; margin-bottom: 12px; display: block; }
        .blocked-empty span { font-size: 14px; }
        
        .blocked-loading {
            text-align: center;
            padding: 20px;
            color: rgba(255, 255, 255, 0.2);
        }
        .blocked-loading i { font-size: 24px; margin-bottom: 8px; display: block; }
        
        .edit-logout-section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .btn-logout {
            width: 100%;
            padding: 14px;
            background: rgba(239, 68, 68, 0.08);
            border: 2px solid rgba(239, 68, 68, 0.15);
            border-radius: 12px;
            color: #ff6b6b;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .btn-logout:hover {
            background: rgba(239, 68, 68, 0.15);
            border-color: #ff6b6b;
            transform: translateY(-2px);
        }
        .btn-logout:active { transform: scale(0.97); }
        .btn-logout i { font-size: 16px; }
        
        /* Business Request Modal */
        .business-request-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 26, 0.92);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            z-index: 30000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .business-request-overlay.active { display: flex; }
        .business-request-content {
            background: #1a1a2e;
            border-radius: 20px;
            max-width: 500px;
            width: 100%;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(192, 132, 252, 0.1);
            animation: businessRequestSlideUp 0.35s ease;
        }
        @keyframes businessRequestSlideUp {
            0% { opacity: 0; transform: translateY(30px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .business-request-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            flex-shrink: 0;
        }
        .business-request-header .title {
            font-weight: 700;
            font-size: 17px;
            color: #fbbf24;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .business-request-header .close-btn {
            background: rgba(255, 255, 255, 0.05);
            border: none;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            color: rgba(255, 255, 255, 0.3);
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s;
        }
        .business-request-header .close-btn:active { transform: scale(0.88); }
        .business-request-body {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }
        .business-request-info {
            background: rgba(251, 191, 36, 0.06);
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 18px;
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            border-left: 3px solid #fbbf24;
        }
        .business-request-info p { margin: 0; }
        .submit-business-request {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            border: none;
            border-radius: 12px;
            color: #1a1a2e;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
            font-family: inherit;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 8px;
        }
        .submit-business-request:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(251, 191, 36, 0.3); }
        .submit-business-request:active { transform: scale(0.97); }
        .business-request-status {
            margin-top: 14px;
            padding: 12px 16px;
            border-radius: 12px;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
        }
        .business-request-status.success {
            background: rgba(34, 197, 94, 0.12);
            color: #4ade80;
            border: 1px solid rgba(34, 197, 94, 0.15);
        }
        .business-request-status.error {
            background: rgba(239, 68, 68, 0.12);
            color: #ff6b6b;
            border: 1px solid rgba(239, 68, 68, 0.15);
        }
        .business-request-status.loading {
            background: rgba(192, 132, 252, 0.08);
            color: #c084fc;
            border: 1px solid rgba(192, 132, 252, 0.1);
        }
        
        /* Scrollbar */
        .edit-profile-body::-webkit-scrollbar,
        .business-request-body::-webkit-scrollbar {
            width: 3px;
        }
        .edit-profile-body::-webkit-scrollbar-track,
        .business-request-body::-webkit-scrollbar-track {
            background: transparent;
        }
        .edit-profile-body::-webkit-scrollbar-thumb,
        .business-request-body::-webkit-scrollbar-thumb {
            background: rgba(192, 132, 252, 0.2);
            border-radius: 10px;
        }
        .edit-profile-body::-webkit-scrollbar-thumb:hover,
        .business-request-body::-webkit-scrollbar-thumb:hover {
            background: rgba(192, 132, 252, 0.4);
        }
        
        /* Responsive */
        @media (max-width: 480px) {
            .edit-profile-header { padding: 12px 16px 10px; }
            .edit-profile-header .title { font-size: 16px; }
            .edit-profile-header .back-btn { width: 32px; height: 32px; font-size: 14px; }
            .edit-profile-header .save-status { font-size: 10px; padding: 3px 10px; }
            .edit-profile-body { padding: 12px 16px 20px; }
            .edit-avatar { width: 60px; height: 60px; }
            .change-avatar-btn { width: 24px; height: 24px; font-size: 10px; }
            .edit-avatar-info .edit-name { font-size: 16px; }
            .edit-avatar-info .edit-username { font-size: 12px; }
            .edit-group input, .edit-group textarea, .edit-group select { font-size: 13px; padding: 10px 12px; }
            .business-request-content { max-width: 100%; border-radius: 16px; margin: 10px; }
            .privacy-option { padding: 10px 14px; }
            .privacy-option .privacy-info .title { font-size: 12px; }
            .privacy-option .privacy-info .desc { font-size: 10px; }
            .btn-logout { font-size: 14px; padding: 12px; }
            .edit-tab-btn { font-size: 11px; padding: 10px 12px; }
            .edit-tab-btn i { font-size: 12px; }
            .community-rules-section { padding: 12px; }
            .rule-item { padding: 10px 12px; gap: 10px; }
            .rule-icon { font-size: 18px; }
            .rule-title { font-size: 13px; }
            .rule-desc { font-size: 12px; }
            .rules-footer { font-size: 12px; padding: 10px 12px; }
            .rules-footer i { font-size: 14px; }
            .blocked-item { padding: 10px 12px; }
            .blocked-item .user-avatar { width: 32px; height: 32px; }
            .btn-unblock { font-size: 11px; padding: 4px 12px; }
            .btn-downgrade-business { font-size: 13px; padding: 10px; }
        }
        @media (max-height: 600px) {
            .edit-profile-header { padding: 10px 16px 8px; }
            .edit-avatar-section { padding: 8px 0 12px; margin-bottom: 12px; }
            .edit-avatar { width: 50px; height: 50px; }
            .edit-avatar-info .edit-name { font-size: 15px; }
            .edit-section { margin-bottom: 12px; padding-bottom: 12px; }
            .edit-section-title { font-size: 12px; margin-bottom: 10px; }
            .edit-group { margin-bottom: 10px; }
            .edit-group input, .edit-group textarea, .edit-group select { font-size: 12px; padding: 8px 12px; }
            .business-request-body { padding: 14px; }
            .edit-tab-btn { font-size: 10px; padding: 8px 10px; }
            .rules-grid { gap: 8px; }
            .rule-item { padding: 8px 10px; }
            .rule-icon { font-size: 16px; }
            .rule-title { font-size: 12px; }
            .rule-desc { font-size: 11px; }
            .rules-footer { font-size: 11px; padding: 8px 12px; }
            .blocked-item .user-avatar { width: 28px; height: 28px; }
            .btn-unblock { font-size: 10px; padding: 3px 10px; }
            .btn-downgrade-business { font-size: 12px; padding: 8px; }
        }
    `;
    document.head.appendChild(styles);
}

// ============================================================
// INYECTAR ESTILOS AL CARGAR EL MÓDULO
// ============================================================

injectStyles();

// ============================================================
// 🔥 ESCUCHAR CAMBIOS DE IDIOMA
// ============================================================

let localeUnsubscribe = null;

function initI18nForEditProfile() {
    if (localeUnsubscribe) {
        localeUnsubscribe();
    }
    
    localeUnsubscribe = onLocaleChange(() => {
        if (isEditProfileOpen) {
            translateEditProfileUI();
        }
    });
}

// ============================================================
// 🔥 TRADUCIR UI DEL MODAL DE EDICIÓN - CORREGIDO (SIN DUPLICACIÓN)
// ============================================================

function translateEditProfileUI() {
    const overlay = document.getElementById('editProfileOverlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    
    console.log('🌐 Traduciendo UI de edición de perfil...');
    
    // 🔥 1. TRADUCIR EL TÍTULO DEL HEADER
    const title = overlay.querySelector('.edit-profile-header .title');
    if (title) {
        const text = t('settings.title');
        if (text && text !== 'settings.title') {
            title.textContent = text;
        }
    }
    
    // 🔥 2. TRADUCIR TABS - SIN DUPLICAR EL TEXTO
    const tabButtons = overlay.querySelectorAll('.edit-tab-btn');
    const i18nKeys = ['profile.edit', 'settings.privacy', 'settings.rules', 'profile.blocked'];
    
    tabButtons.forEach((btn, index) => {
        if (index < i18nKeys.length) {
            const icon = btn.querySelector('i');
            const badge = btn.querySelector('.tab-badge');
            const text = t(i18nKeys[index]);
            
            if (text && text !== i18nKeys[index]) {
                // 🔥 LIMPIAR SOLO EL TEXTO, MANTENER ICONO Y BADGE
                const iconClone = icon ? icon.cloneNode(true) : null;
                const badgeClone = badge ? badge.cloneNode(true) : null;
                
                // Limpiar el contenido del botón
                btn.innerHTML = '';
                
                // Reconstruir: icono, texto, badge
                if (iconClone) btn.appendChild(iconClone);
                btn.appendChild(document.createTextNode(' ' + text));
                if (badgeClone) btn.appendChild(badgeClone);
            }
        }
    });
    
    // 🔥 3. TRADUCIR LABELS - SIN DUPLICACIÓN
    const labels = overlay.querySelectorAll('.edit-group label');
    labels.forEach(label => {
        const key = label.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                const required = label.querySelector('.required');
                // Limpiar solo los nodos de texto
                const textNodes = [];
                for (const node of label.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        textNodes.push(node);
                    }
                }
                textNodes.forEach(node => {
                    node.textContent = '';
                });
                // Insertar el nuevo texto al principio
                const firstChild = label.firstChild;
                if (firstChild) {
                    label.insertBefore(document.createTextNode(text), firstChild);
                } else {
                    label.appendChild(document.createTextNode(text));
                }
                if (required) label.appendChild(required);
            }
        }
    });
    
    // 🔥 4. TRADUCIR PLACEHOLDERS
    const inputs = overlay.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        const placeholderKey = input.getAttribute('data-i18n-placeholder');
        if (placeholderKey) {
            const text = t(placeholderKey);
            if (text && text !== placeholderKey) {
                input.placeholder = text;
            }
        }
    });
    
    // 🔥 5. TRADUCIR BOTONES - SIN DUPLICACIÓN
    const buttons = overlay.querySelectorAll('.business-request-btn, .btn-downgrade-business, .btn-logout, .submit-business-request, .btn-unblock');
    buttons.forEach(btn => {
        const key = btn.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                const icon = btn.querySelector('i');
                btn.innerHTML = '';
                if (icon) btn.appendChild(icon);
                btn.appendChild(document.createTextNode(' ' + text));
            }
        }
    });
    
    // 🔥 6. TRADUCIR EL ESTADO DE GUARDADO
    const saveStatusSpan = overlay.querySelector('.save-status span');
    if (saveStatusSpan) {
        const key = saveStatusSpan.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                saveStatusSpan.textContent = text;
            }
        }
    }
    
    // 🔥 7. TRADUCIR REGLAS
    const ruleTitles = overlay.querySelectorAll('.rule-title');
    const ruleDescs = overlay.querySelectorAll('.rule-desc');
    const ruleKeys = [
        'rules.respect.title', 'rules.respect.desc',
        'rules.nsfw.title', 'rules.nsfw.desc',
        'rules.ephemeral.title', 'rules.ephemeral.desc',
        'rules.age.title', 'rules.age.desc',
        'rules.language.title', 'rules.language.desc',
        'rules.laws.title', 'rules.laws.desc'
    ];
    
    ruleTitles.forEach((el, index) => {
        const keyIndex = index * 2;
        if (keyIndex < ruleKeys.length) {
            const key = ruleKeys[keyIndex];
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    ruleDescs.forEach((el, index) => {
        const keyIndex = (index * 2) + 1;
        if (keyIndex < ruleKeys.length) {
            const key = ruleKeys[keyIndex];
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 8. TRADUCIR FOOTER DE REGLAS
    const rulesFooter = overlay.querySelector('.rules-footer span');
    if (rulesFooter) {
        const key = rulesFooter.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                rulesFooter.textContent = text;
            }
        }
    }
    
    // 🔥 9. TRADUCIR HELPERS
    const helpers = overlay.querySelectorAll('.edit-helper span');
    helpers.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 10. TRADUCIR TÍTULOS DE SECCIÓN
    const sectionTitles = overlay.querySelectorAll('.edit-section-title span');
    sectionTitles.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 11. TRADUCIR DESCRIPCIONES DE PRIVACIDAD
    const privacyDescs = overlay.querySelectorAll('.privacy-option .privacy-info .desc');
    privacyDescs.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 12. TRADUCIR TÍTULOS DE PRIVACIDAD
    const privacyTitles = overlay.querySelectorAll('.privacy-option .privacy-info .title');
    privacyTitles.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 13. TRADUCIR TEXTO DE EMPRESA PENDIENTE
    const businessPending = overlay.querySelectorAll('.business-request-sent span, .business-request-sent div');
    businessPending.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                el.textContent = text;
            }
        }
    });
    
    // 🔥 14. TRADUCIR EL BOTÓN DE CERRAR SESIÓN (si tiene span)
    const logoutBtn = overlay.querySelector('.btn-logout span');
    if (logoutBtn) {
        const key = logoutBtn.getAttribute('data-i18n');
        if (key) {
            const text = t(key);
            if (text && text !== key) {
                logoutBtn.textContent = text;
            }
        }
    }
    
    console.log('✅ UI de edición de perfil traducida');
}

// ============================================================
// 🔥 FUNCIÓN PARA ACTUALIZAR IDIOMA EN i18n DESPUÉS DE GUARDAR
// ============================================================

async function updateLocaleAfterSave(user) {
    if (!user || !user.language) return;
    
    try {
        setLocale(user.language);
        console.log(`🌐 [i18n] Idioma actualizado a: ${user.language}`);
        
        // Traducir la UI después del cambio
        setTimeout(translateEditProfileUI, 150);
        
        // También traducir el resto de la página
        setTimeout(() => {
            if (typeof translateAll === 'function') {
                translateAll();
            }
        }, 200);
    } catch (error) {
        console.warn('⚠️ Error actualizando idioma en i18n:', error);
    }
}

// ============================================================
// 🔥 ACTIVAR PESTAÑA 'profile' VISUALMENTE
// ============================================================

function activateProfileTab() {
    // Actualizar botones
    document.querySelectorAll('.edit-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'profile');
    });
    
    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === 'profile');
    });
    
    currentTab = 'profile';
}

// ============================================================
// 🔥 ACTUALIZAR TÍTULO DE LA PESTAÑA ACTIVA
// ============================================================

function updateActiveTabTitle() {
    const activeBtn = document.querySelector('.edit-tab-btn.active');
    if (activeBtn) {
        const span = activeBtn.querySelector('span');
        if (span) {
            const text = t('profile.edit');
            if (text && text !== 'profile.edit') {
                span.textContent = text;
            }
        }
    }
}

// ============================================================
// ABRIR MODAL DE EDICIÓN DE PERFIL - CORREGIDO
// ============================================================

export function openEditProfileModal(userData) {
    console.log('🔧 openEditProfileModal EJECUTADO');
    
    if (!userData) {
        const user = getCurrentUser();
        if (!user) {
            showToast('Inicia sesión para editar tu perfil', true);
            return;
        }
        userData = user;
    }

    currentUserData = userData;
    originalUsername = userData.username || '';
    isBusinessRequestSent = false;
    
    // 🔥 FORZAR LA PESTAÑA 'profile' AL ABRIR
    currentTab = 'profile';
    
    if (userData.businessInfo && (userData.accountType === 'business' || userData.accountType === 'business_verified')) {
        isBusinessRequestSent = true;
    }

    // 🔥 ELIMINAR OVERLAY ANTERIOR SI EXISTE PARA LIMPIAR ESTADO
    const existingOverlay = document.getElementById('editProfileOverlay');
    if (existingOverlay) {
        // Limpiar completamente el DOM
        existingOverlay.remove();
        // Reiniciar variables de estado
        isEditProfileOpen = false;
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        if (localeUnsubscribe) {
            localeUnsubscribe();
            localeUnsubscribe = null;
        }
    }

    isEditProfileOpen = true;
    createEditProfileHTML();
    
    // 🔥 ESPERAR A QUE EL DOM ESTÉ LISTO
    setTimeout(() => {
        const newOverlay = document.getElementById('editProfileOverlay');
        if (newOverlay) {
            newOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            
            // 🔥 FORZAR LA PESTAÑA 'profile' VISUALMENTE
            activateProfileTab();
            
            loadEditProfileData(userData);
            // Traducir después de cargar
            setTimeout(() => {
                translateEditProfileUI();
                // 🔥 ACTUALIZAR EL TÍTULO DE LA PESTAÑA ACTIVA
                updateActiveTabTitle();
            }, 200);
            console.log('✅ Modal de edición abierto');
        } else {
            console.error('❌ No se pudo crear el overlay de edición');
            showToast('Error al abrir edición de perfil', true);
        }
    }, 150);
    
    // Inicializar i18n para el modal
    initI18nForEditProfile();
}

// ============================================================
// CERRAR MODAL DE EDICIÓN DE PERFIL - CORREGIDO
// ============================================================

export function closeEditProfileModal() {
    isEditProfileOpen = false;
    currentUserData = null;
    isBusinessRequestSent = false;
    
    // 🔥 REINICIAR LA PESTAÑA A 'profile'
    currentTab = 'profile';
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
    
    if (localeUnsubscribe) {
        localeUnsubscribe();
        localeUnsubscribe = null;
    }

    const overlay = document.getElementById('editProfileOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        // No eliminar el overlay para evitar recrearlo cada vez
        // pero resetear el estado interno
    }
    document.body.style.overflow = '';
}

// ============================================================
// CREAR HTML DEL MODAL DE EDICIÓN
// ============================================================

function createEditProfileHTML() {
    const html = `
        <div id="editProfileOverlay" class="edit-profile-overlay">
            <div class="edit-profile-content" onclick="event.stopPropagation()">
                <div class="edit-profile-header">
                    <button class="back-btn" id="editProfileBackBtn">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <span class="title" data-i18n="settings.title">Configuración</span>
                    <span class="save-status" id="saveStatus">
                        <i class="fas fa-check"></i> <span data-i18n="action.save">Guardado</span>
                    </span>
                </div>
                
                <!-- TABS -->
                <div class="edit-profile-tabs" id="editProfileTabs">
                    <button class="edit-tab-btn active" data-tab="profile" onclick="window.switchEditTab('profile')">
                        <i class="fas fa-user"></i> <span data-i18n="profile.edit">Perfil</span>
                    </button>
                    <button class="edit-tab-btn" data-tab="privacy" onclick="window.switchEditTab('privacy')">
                        <i class="fas fa-lock"></i> <span data-i18n="settings.privacy">Privacidad</span>
                    </button>
                    <button class="edit-tab-btn" data-tab="rules" onclick="window.switchEditTab('rules')">
                        <i class="fas fa-gavel"></i> <span data-i18n="settings.rules">Reglas</span>
                    </button>
                    <button class="edit-tab-btn" data-tab="blocked" onclick="window.switchEditTab('blocked')">
                        <i class="fas fa-ban"></i> <span data-i18n="profile.blocked">Bloqueados</span>
                        <span class="tab-badge" id="blockedBadge">0</span>
                    </button>
                </div>
                
                <div class="edit-profile-body" id="editProfileBody">
                    <div class="edit-loading">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <span data-i18n="modal.loading">Cargando...</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    const overlay = document.getElementById('editProfileOverlay');
    const backBtn = document.getElementById('editProfileBackBtn');

    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                closeEditProfileModal();
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', closeEditProfileModal);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isEditProfileOpen) {
            closeEditProfileModal();
        }
    });

    window.selectEditPrivacy = selectEditPrivacy;
    window.requestBusinessAccount = requestBusinessAccount;
    window.closeBusinessRequestModal = closeBusinessRequestModal;
    window.submitBusinessRequest = submitBusinessRequest;
    window.handleLogout = handleLogout;
    window.switchEditTab = switchEditTab;
    window.unblockUser = unblockUser;
    window.loadBlockedList = loadBlockedList;
    window.downgradeBusinessAccount = downgradeBusinessAccount;
}

// ============================================================
// CAMBIAR TAB
// ============================================================

function switchEditTab(tab) {
    currentTab = tab;
    
    // Actualizar botones
    document.querySelectorAll('.edit-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Actualizar contenido
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.dataset.tab === tab);
    });
    
    // Cargar lista de bloqueados si es la tab
    if (tab === 'blocked') {
        loadBlockedList();
    }
}

// ============================================================
// ACTUALIZAR ESTADO DE GUARDADO
// ============================================================

function updateSaveStatus(status, message) {
    const el = document.getElementById('saveStatus');
    if (!el) return;
    
    el.className = 'save-status';
    if (status === 'saving') {
        el.classList.add('saving');
        el.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> <span data-i18n="action.save">Guardando...</span>';
    } else if (status === 'saved') {
        el.classList.add('saved');
        el.innerHTML = '<i class="fas fa-check"></i> <span data-i18n="action.save">Guardado</span>';
    } else {
        el.innerHTML = '<i class="fas fa-check"></i> ' + (message || t('action.save'));
    }
}

// ============================================================
// AUTO-GUARDAR CAMBIOS
// ============================================================

function autoSave() {
    if (isSaving) return;
    
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    
    updateSaveStatus('saving');
    
    saveTimeout = setTimeout(async () => {
        await performSave();
        saveTimeout = null;
    }, 800);
}

// ============================================================
// EJECUTAR GUARDADO
// ============================================================

async function performSave() {
    const token = getToken();
    if (!token) return;

    const fullName = document.getElementById('editFullName')?.value.trim() || '';
    const username = document.getElementById('editUsername')?.value.trim() || '';
    const bio = document.getElementById('editBio')?.value.trim() || '';
    const language = document.getElementById('editLanguage')?.value || 'es';
    const privacy = window._selectedPrivacy || 'public';

    if (username && !validateUsername(username)) {
        updateSaveStatus('error', t('error.unauthorized'));
        return;
    }

    const payload = {
        fullName,
        bio,
        language,
        privacy
    };

    if (username !== originalUsername) {
        const daysRemaining = getDaysUntilNextChange(currentUserData?.lastUsernameChange);
        if (daysRemaining > 0) {
            updateSaveStatus('error', `Espera ${daysRemaining} días`);
            return;
        }
        payload.username = username;
        payload.lastUsernameChange = new Date().toISOString();
    }

    isSaving = true;

    try {
        const profileRes = await fetch(`${API_URL}/api/users/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const privacyRes = await fetch(`${API_URL}/api/privacy`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ privacy })
        });

        if (profileRes.ok && privacyRes.ok) {
            const updatedUser = await profileRes.json();
            setCurrentUser(updatedUser);
            currentUserData = updatedUser;
            originalUsername = updatedUser.username || '';
            updateSaveStatus('saved');
            
            // 🔥🔥🔥 ACTUALIZAR IDIOMA EN i18n
            if (updatedUser.language) {
                await updateLocaleAfterSave(updatedUser);
            }
            
            const profileOverlay = document.getElementById('profileModalOverlay');
            if (profileOverlay && profileOverlay.classList.contains('active')) {
                const userId = updatedUser.id;
                const profileCache = window._profileCache || new Map();
                const storiesCache = window._storiesCache || new Map();
                profileCache.delete(userId);
                storiesCache.delete(userId);
                if (window.loadProfileData) {
                    window.loadProfileData(userId);
                }
            }
        } else {
            updateSaveStatus('error', t('error.general'));
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        updateSaveStatus('error', t('error.network'));
    } finally {
        isSaving = false;
    }
}

// ============================================================
// CARGAR DATOS PARA EDITAR PERFIL
// ============================================================

function loadEditProfileData(user) {
    const container = document.getElementById('editProfileBody');
    if (!container) {
        console.warn('⚠️ Container editProfileBody no encontrado');
        return;
    }

    const avatarUrl = user.avatar || getAvatar(user.fullName || user.username);
    const fullName = escapeHtml(user.fullName || '');
    const username = escapeHtml(user.username || '');
    const bio = escapeHtml(user.bio || '');
    const language = user.language || 'es';
    const privacy = user.privacy || 'public';
    const accountType = user.accountType || 'personal';
    const isAdmin = user.role === 'admin';
    const isVerified = user.isVerified || false;
    const verifiedBadge = isVerified ? '<span class="verified-badge">✅</span>' : '';

    const hasBusinessRequest = user.businessInfo && (accountType === 'business' || accountType === 'business_verified');

    const languages = {
        'es': 'Español',
        'en': 'English',
        'pt': 'Português',
        'fr': 'Français',
        'de': 'Deutsch',
        'it': 'Italiano',
        'ja': '日本語',
        'zh': '中文',
        'ru': 'Русский',
        'ar': 'العربية'
    };

    const languageOptions = Object.entries(languages).map(([code, name]) => 
        `<option value="${code}" ${code === language ? 'selected' : ''}>${name}</option>`
    ).join('');

    const accountTypes = [
        { value: 'personal', label: '👤 Personal' },
        { value: 'business', label: '🏢 Empresa' }
    ];

    const accountTypeOptions = accountTypes.map(type => {
        const isSelected = type.value === accountType;
        return `<option value="${type.value}" ${isSelected ? 'selected' : ''}>${type.label}</option>`;
    }).join('');

    const isSpecialAccount = accountType === 'verified' || accountType === 'business_verified';
    let accountTypeDisplay = '';
    
    if (isSpecialAccount) {
        const labels = {
            'verified': '✅ Verificado',
            'business_verified': '🏢✅ Empresa verificada'
        };
        accountTypeDisplay = `
            <div class="account-type-locked">
                <i class="fas fa-lock"></i>
                Tipo de cuenta: <strong style="color:#4ade80;">${labels[accountType] || accountType}</strong>
                <span style="font-size:11px;color:rgba(255,255,255,0.2);margin-left:auto;">Bloqueado</span>
            </div>
        `;
    }

    const lastUsernameChange = user.lastUsernameChange || user.createdAt;
    const daysRemaining = getDaysUntilNextChange(lastUsernameChange);
    const usernameDisabled = daysRemaining > 0;

    // ============================================================
    // SECCIÓN DE EMPRESA
    // ============================================================
    let businessSectionHtml = '';
    
    if (isAdmin) {
        businessSectionHtml = `
            <div class="edit-section business-info-section">
                <div class="edit-section-title"><i class="fas fa-shield-alt" style="color:#c084fc;"></i> <span data-i18n="settings.admin">Cuenta de administrador</span></div>
                <div class="edit-helper"><i class="fas fa-info-circle"></i> <span data-i18n="settings.adminInfo">Los administradores tienen cuenta verificada automáticamente</span></div>
            </div>
        `;
    } else if (accountType === 'personal' || accountType === 'verified') {
        if (hasBusinessRequest || isBusinessRequestSent) {
            businessSectionHtml = `
                <div class="edit-section business-request-section">
                    <div class="edit-section-title"><i class="fas fa-building"></i> <span data-i18n="profile.businessRequest">Solicitar cuenta de empresa</span></div>
                    <div class="business-request-sent">
                        <i class="fas fa-check-circle" style="color:#4ade80;"></i>
                        <span style="color:#4ade80;font-weight:500;">✅ <span data-i18n="profile.businessRequestSent">Solicitud enviada</span></span>
                        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;"><span data-i18n="profile.businessRequestPending">Tu solicitud está siendo revisada por el equipo de moderación</span></div>
                    </div>
                </div>
            `;
        } else {
            businessSectionHtml = `
                <div class="edit-section business-request-section">
                    <div class="edit-section-title"><i class="fas fa-building"></i> <span data-i18n="profile.businessRequest">Solicitar cuenta de empresa</span></div>
                    <button class="business-request-btn" onclick="window.requestBusinessAccount()" data-i18n="profile.businessRequestBtn">
                        <i class="fas fa-store"></i> <span>Solicitar cuenta de empresa</span>
                    </button>
                    <div class="edit-helper"><i class="fas fa-info-circle"></i> <span data-i18n="profile.businessRequestInfo">Al solicitar, tu cuenta será revisada por el equipo de moderación</span></div>
                </div>
            `;
        }
    } else if (accountType === 'business') {
        businessSectionHtml = `
            <div class="edit-section business-info-section">
                <div class="edit-section-title"><i class="fas fa-building" style="color:#fbbf24;"></i> <span data-i18n="profile.businessAccount">Cuenta de empresa</span></div>
                ${user.businessInfo ? `
                    <div class="business-info-display">
                        <div><strong><span data-i18n="profile.businessName">Nombre</span>:</strong> ${escapeHtml(user.businessInfo.name || '')}</div>
                        <div><strong><span data-i18n="profile.businessType">Tipo</span>:</strong> ${escapeHtml(user.businessInfo.type || '')}</div>
                        <div><strong><span data-i18n="profile.businessStatus">Estado</span>:</strong> ⏳ <span data-i18n="profile.businessPending">Pendiente de verificación</span></div>
                        ${user.businessInfo.trialEndsAt ? `
                            <div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,0.3);">
                                <i class="fas fa-clock"></i> <span data-i18n="profile.businessTrial">Período de prueba hasta</span>: ${new Date(user.businessInfo.trialEndsAt).toLocaleDateString()}
                            </div>
                        ` : ''}
                    </div>
                ` : `
                    <div class="edit-helper"><span data-i18n="profile.businessActive">Cuenta de empresa activa</span></div>
                `}
                
                <button class="btn-downgrade-business" onclick="window.downgradeBusinessAccount()" data-i18n="profile.downgradeBusiness">
                    <i class="fas fa-user"></i> <span>Dejar de ser empresa</span>
                </button>
                <div class="edit-helper" style="color:#fbbf24;">
                    <i class="fas fa-info-circle"></i> <span data-i18n="profile.downgradeBusinessInfo">Al dejar de ser empresa, volverás a una cuenta personal</span>
                </div>
            </div>
        `;
    } else {
        businessSectionHtml = `
            <div class="edit-section business-info-section">
                <div class="edit-section-title"><i class="fas fa-building" style="color:#4ade80;"></i> <span data-i18n="profile.businessVerified">Cuenta de empresa verificada</span></div>
                ${user.businessInfo ? `
                    <div class="business-info-display">
                        <div><strong><span data-i18n="profile.businessName">Nombre</span>:</strong> ${escapeHtml(user.businessInfo.name || '')}</div>
                        <div><strong><span data-i18n="profile.businessType">Tipo</span>:</strong> ${escapeHtml(user.businessInfo.type || '')}</div>
                        <div><strong><span data-i18n="profile.businessStatus">Estado</span>:</strong> ✅ <span data-i18n="profile.businessVerifiedStatus">Verificada</span></div>
                        <div style="margin-top:8px;font-size:12px;color:#4ade80;">
                            <i class="fas fa-check-circle"></i> <span data-i18n="profile.businessVerifiedByMod">Cuenta verificada por el equipo de moderación</span>
                        </div>
                    </div>
                ` : `
                    <div class="edit-helper" style="color:#4ade80;">
                        <i class="fas fa-check-circle"></i> <span data-i18n="profile.businessVerifiedStatus">Cuenta de empresa verificada</span>
                    </div>
                `}
                <div class="account-type-locked" style="border-color:rgba(74,222,128,0.2);">
                    <i class="fas fa-lock" style="color:#4ade80;"></i>
                    <span data-i18n="profile.businessLocked">No puedes cambiar una cuenta verificada. Contacta al soporte.</span>
                </div>
            </div>
        `;
    }

    // ============================================================
    // HTML DE LAS TABS
    // ============================================================
    
    const blockedCount = (user.blocked || []).length;
    const badgeEl = document.getElementById('blockedBadge');
    if (badgeEl) badgeEl.textContent = blockedCount;

    container.innerHTML = `
        <!-- TAB 1: PERFIL -->
        <div class="tab-content active" data-tab="profile">
            <div class="edit-avatar-section">
                <div class="edit-avatar-wrapper">
                    <img class="edit-avatar" src="${avatarUrl}" alt="${fullName}" 
                         onerror="this.src='${getAvatar(fullName || 'U')}'" />
                    <button class="change-avatar-btn" id="changeAvatarBtn" title="Cambiar avatar">
                        <i class="fas fa-camera"></i>
                    </button>
                </div>
                <div class="edit-avatar-info">
                    <div class="edit-name">${fullName} ${verifiedBadge}</div>
                    <div class="edit-username">@${username}</div>
                    ${isAdmin ? '<div class="edit-role admin">👑 Administrador</div>' : ''}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title"><i class="fas fa-user-circle"></i> <span data-i18n="profile.personalInfo">Información personal</span></div>
                
                <div class="edit-group">
                    <label data-i18n="profile.fullName">Nombre completo</label>
                    <input type="text" id="editFullName" value="${fullName}" data-i18n-placeholder="profile.fullNamePlaceholder" placeholder="Tu nombre completo" maxlength="50">
                    <div class="edit-helper"><span data-i18n="profile.maxChars">Máximo 50 caracteres</span></div>
                </div>

                <div class="edit-group">
                    <label data-i18n="profile.username">Nombre de usuario</label>
                    <input type="text" id="editUsername" value="${username}" data-i18n-placeholder="profile.usernamePlaceholder" placeholder="Nombre de usuario" 
                           maxlength="20" ${usernameDisabled ? 'disabled' : ''}>
                    <div class="edit-helper ${usernameDisabled ? 'warning' : ''}">
                        ${usernameDisabled 
                            ? `<i class="fas fa-clock"></i> Podrás cambiar en ${daysRemaining} día${daysRemaining > 1 ? 's' : ''}`
                            : '<i class="fas fa-info-circle"></i> Solo letras, números y _ (3-20 caracteres)'
                        }
                    </div>
                    <div id="usernameStatus" class="edit-helper" style="display:none;"></div>
                </div>

                <div class="edit-group">
                    <label data-i18n="profile.bio">Biografía</label>
                    <textarea id="editBio" rows="3" data-i18n-placeholder="profile.bioPlaceholder" placeholder="Cuéntanos sobre ti..." maxlength="200">${bio}</textarea>
                    <div class="edit-helper"><span id="bioCount">${bio.length}</span>/200 <span data-i18n="profile.characters">caracteres</span></div>
                </div>
            </div>

            ${businessSectionHtml}
        </div>

        <!-- TAB 2: PRIVACIDAD Y PREFERENCIAS -->
        <div class="tab-content" data-tab="privacy">
            <div class="edit-section">
                <div class="edit-section-title"><i class="fas fa-globe"></i> <span data-i18n="settings.preferences">Preferencias</span></div>

                <div class="edit-group">
                    <label data-i18n="settings.language">Idioma</label>
                    <select id="editLanguage">
                        ${languageOptions}
                    </select>
                </div>

                <div class="edit-group">
                    <label data-i18n="settings.accountType">Tipo de cuenta</label>
                    ${isSpecialAccount ? accountTypeDisplay : `
                        <select id="editAccountType">
                            ${accountTypeOptions}
                        </select>
                    `}
                    ${isSpecialAccount ? '' : '<div class="edit-helper"><i class="fas fa-info-circle"></i> Solo puedes cambiar entre Personal y Empresa</div>'}
                    ${isVerified && !isAdmin && !isSpecialAccount ? '<div class="edit-helper success"><i class="fas fa-check-circle"></i> Cuenta verificada</div>' : ''}
                </div>
            </div>

            <div class="edit-section">
                <div class="edit-section-title"><i class="fas fa-lock"></i> <span data-i18n="settings.privacy">Privacidad</span></div>

                <div class="privacy-options">
                    <div class="privacy-option ${privacy === 'public' ? 'active' : ''}" data-privacy="public" onclick="window.selectEditPrivacy('public')">
                        <div class="privacy-icon">🌍</div>
                        <div class="privacy-info">
                            <div class="title" data-i18n="settings.privacyPublic">Público</div>
                            <div class="desc" data-i18n="settings.privacyPublicDesc">Cualquiera puede ver tu perfil y seguirte sin solicitud</div>
                        </div>
                        <div class="privacy-check"><i class="fas fa-check"></i></div>
                    </div>
                    
                    <div class="privacy-option ${privacy === 'followers' ? 'active' : ''}" data-privacy="followers" onclick="window.selectEditPrivacy('followers')">
                        <div class="privacy-icon">👥</div>
                        <div class="privacy-info">
                            <div class="title" data-i18n="settings.privacyFollowers">Solo seguidores</div>
                            <div class="desc" data-i18n="settings.privacyFollowersDesc">Solo tus seguidores pueden ver tus historias</div>
                        </div>
                        <div class="privacy-check"><i class="fas fa-check"></i></div>
                    </div>
                    
                    <div class="privacy-option ${privacy === 'private' ? 'active' : ''}" data-privacy="private" onclick="window.selectEditPrivacy('private')">
                        <div class="privacy-icon">🔒</div>
                        <div class="privacy-info">
                            <div class="title" data-i18n="settings.privacyPrivate">Privado</div>
                            <div class="desc" data-i18n="settings.privacyPrivateDesc">Solo tú puedes ver tu perfil</div>
                        </div>
                        <div class="privacy-check"><i class="fas fa-check"></i></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 3: REGLAS Y NORMAS -->
        <div class="tab-content" data-tab="rules">
            <div class="community-rules-section">
                <div class="edit-section-title">
                    <i class="fas fa-gavel" style="color: #fbbf24;"></i> 
                    <span data-i18n="settings.rules">Reglas y normas de la comunidad</span>
                </div>

                <div class="rules-grid">
                    <div class="rule-item">
                        <div class="rule-icon">🤝</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.respect.title">Respeta a los demás</div>
                            <div class="rule-desc" data-i18n="rules.respect.desc">Trata a todos con respeto. No se tolerará el acoso, el odio o la discriminación.</div>
                        </div>
                    </div>

                    <div class="rule-item">
                        <div class="rule-icon">🚫</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.nsfw.title">Sin NSFW ni contenido sensible</div>
                            <div class="rule-desc" data-i18n="rules.nsfw.desc">No se permite contenido explícito, violento, o que pueda ser considerado sensible o perturbador.</div>
                        </div>
                    </div>

                    <div class="rule-item">
                        <div class="rule-icon">⏳</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.ephemeral.title">Contenido efímero</div>
                            <div class="rule-desc" data-i18n="rules.ephemeral.desc">Todo lo que compartes aquí es temporal. Las historias desaparecen después de 24 horas. ¡Disfruta el momento!</div>
                        </div>
                    </div>

                    <div class="rule-item">
                        <div class="rule-icon">🔞</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.age.title">Contenido para mayores de 16 años</div>
                            <div class="rule-desc" data-i18n="rules.age.desc">Esta plataforma está diseñada para usuarios mayores de 16 años. La supervisión parental es recomendada para menores.</div>
                        </div>
                    </div>

                    <div class="rule-item">
                        <div class="rule-icon">💬</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.language.title">Idioma y comunicación</div>
                            <div class="rule-desc" data-i18n="rules.language.desc">Fomenta un ambiente positivo. El lenguaje ofensivo o las discusiones tóxicas no son bienvenidas.</div>
                        </div>
                    </div>

                    <div class="rule-item">
                        <div class="rule-icon">⚖️</div>
                        <div class="rule-content">
                            <div class="rule-title" data-i18n="rules.laws.title">Cumple con las leyes locales</div>
                            <div class="rule-desc" data-i18n="rules.laws.desc">Asegúrate de que tu contenido cumpla con todas las leyes y regulaciones aplicables en tu país.</div>
                        </div>
                    </div>
                </div>

                <div class="rules-footer">
                    <i class="fas fa-info-circle"></i>
                    <span data-i18n="rules.footer">Estas reglas aplican para todos los usuarios. El incumplimiento puede resultar en la suspensión de tu cuenta.</span>
                </div>
            </div>
        </div>

        <!-- TAB 4: LISTA DE BLOQUEADOS -->
        <div class="tab-content" data-tab="blocked">
            <div class="edit-section">
                <div class="edit-section-title">
                    <i class="fas fa-ban" style="color: #ff6b6b;"></i> 
                    <span data-i18n="profile.blockedUsers">Usuarios bloqueados</span>
                    <span style="font-size:12px;color:rgba(255,255,255,0.2);margin-left:auto;">${blockedCount} <span data-i18n="profile.blocked">bloqueados</span></span>
                </div>
                <div id="blockedListContainer">
                    <div class="blocked-loading">
                        <i class="fas fa-spinner fa-pulse"></i>
                        <span data-i18n="modal.loading">Cargando lista de bloqueados...</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- LOGOUT (siempre visible al final) -->
        <div class="edit-logout-section">
            <button class="btn-logout" onclick="window.handleLogout()" data-i18n="nav.logout">
                <i class="fas fa-sign-out-alt"></i>
                <span>Cerrar sesión</span>
            </button>
            <div class="edit-helper" style="text-align:center;margin-top:8px;">
                <i class="fas fa-info-circle"></i> <span data-i18n="settings.logoutInfo">Cerrarás tu sesión actual</span>
            </div>
        </div>
    `;

    // Eventos para auto-guardado
    const autoSaveFields = ['editFullName', 'editUsername', 'editBio', 'editLanguage', 'editAccountType'];
    
    autoSaveFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('input', () => {
                if (fieldId === 'editUsername') {
                    const value = el.value.trim();
                    const status = document.getElementById('usernameStatus');
                    if (status) {
                        if (value && !validateUsername(value)) {
                            status.style.display = 'block';
                            status.className = 'edit-helper error';
                            status.innerHTML = '<i class="fas fa-exclamation-circle"></i> Solo letras, números y _ (3-20 caracteres)';
                        } else if (value) {
                            status.style.display = 'block';
                            status.className = 'edit-helper success';
                            status.innerHTML = '<i class="fas fa-check-circle"></i> Nombre de usuario válido';
                        } else {
                            status.style.display = 'none';
                        }
                    }
                }
                
                if (fieldId === 'editBio') {
                    const count = document.getElementById('bioCount');
                    if (count) {
                        count.textContent = el.value.length;
                    }
                }
                
                autoSave();
            });
            
            el.addEventListener('blur', () => {
                if (saveTimeout) {
                    clearTimeout(saveTimeout);
                    performSave();
                }
            });
        }
    });

    window.selectEditPrivacy = function(privacy) {
        window._selectedPrivacy = privacy;
        document.querySelectorAll('.privacy-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.privacy === privacy);
        });
        autoSave();
    };

    document.getElementById('changeAvatarBtn')?.addEventListener('click', () => {
        showToast('📸 Cambiar avatar (próximamente)', false, 2000);
    });

    window._selectedPrivacy = privacy;
    
    // Cargar lista de bloqueados si la tab está activa
    if (currentTab === 'blocked') {
        loadBlockedList();
    }
    
    setTimeout(() => {
        updateSaveStatus('saved');
        // 🔥 TRADUCIR LA UI DESPUÉS DE CARGAR
        translateEditProfileUI();
    }, 500);
}

// ============================================================
// 🔥 DEJAR DE SER EMPRESA (DOWNGRADE)
// ============================================================

async function downgradeBusinessAccount() {
    const user = getCurrentUser();
    if (!user) {
        showToast('Inicia sesión para realizar esta acción', true);
        return;
    }

    if (user.accountType !== 'business') {
        showToast('❌ No puedes realizar esta acción', true);
        return;
    }

    if (!confirm('¿Estás seguro de que quieres dejar de ser una cuenta de empresa?\n\nVolverás a una cuenta personal y perderás los beneficios de empresa.')) {
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para realizar esta acción', true);
        return;
    }

    showToast('⏳ Procesando...', false, 2000);

    try {
        const response = await fetch(`${API_URL}/api/verified/business/downgrade`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            showToast('✅ Has dejado de ser una cuenta de empresa', false);
            
            if (currentUserData) {
                currentUserData.accountType = 'personal';
                currentUserData.businessInfo = null;
                setCurrentUser(currentUserData);
            }
            
            loadEditProfileData(currentUserData || getCurrentUser());
            
            const profileOverlay = document.getElementById('profileModalOverlay');
            if (profileOverlay && profileOverlay.classList.contains('active')) {
                const userId = user.id;
                const profileCache = window._profileCache || new Map();
                profileCache.delete(userId);
                if (window.loadProfileData) {
                    window.loadProfileData(userId);
                }
            }
        } else {
            showToast(`❌ ${data.error || 'Error al procesar la solicitud'}`, true);
        }
    } catch (error) {
        console.error('Error downgrading business account:', error);
        showToast('❌ Error de conexión', true);
    }
}

// ============================================================
// 🔥 CARGAR LISTA DE BLOQUEADOS
// ============================================================

async function loadBlockedList() {
    const container = document.getElementById('blockedListContainer');
    if (!container) return;

    const token = getToken();
    if (!token) {
        container.innerHTML = `
            <div class="blocked-empty">
                <i class="fas fa-exclamation-circle"></i>
                <span data-i18n="error.unauthorized">Inicia sesión para ver tu lista de bloqueados</span>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="blocked-loading">
            <i class="fas fa-spinner fa-pulse"></i>
            <span data-i18n="modal.loading">Cargando...</span>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/api/blocked/blocked`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar la lista de bloqueados');
        }

        const blockedUsers = await response.json();

        const badge = document.getElementById('blockedBadge');
        if (badge) badge.textContent = blockedUsers.length;

        if (blockedUsers.length === 0) {
            container.innerHTML = `
                <div class="blocked-empty">
                    <i class="fas fa-smile"></i>
                    <span data-i18n="profile.noBlocked">No tienes usuarios bloqueados</span>
                    <div style="font-size:12px;color:rgba(255,255,255,0.15);margin-top:8px;"><span data-i18n="profile.blockedSilent">Los bloqueos son silenciosos, el usuario no se entera</span></div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="blocked-list-container">
                ${blockedUsers.map(user => `
                    <div class="blocked-item" data-userid="${user.id}">
                        <div class="user-info">
                            <img class="user-avatar" src="${user.avatar || getAvatar(user.fullName || user.username)}" 
                                 alt="${escapeHtml(user.fullName)}"
                                 onerror="this.src='${getAvatar(user.fullName || 'U')}'" />
                            <div>
                                <div class="user-name">${escapeHtml(user.fullName)}</div>
                                <div class="user-username">@${escapeHtml(user.username)}</div>
                            </div>
                        </div>
                        <button class="btn-unblock" onclick="window.unblockUser('${user.id}')" data-i18n="profile.unblock">
                            <i class="fas fa-user-plus"></i> Desbloquear
                        </button>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        console.error('Error loading blocked list:', error);
        container.innerHTML = `
            <div class="blocked-empty">
                <i class="fas fa-exclamation-triangle" style="color:#fbbf24;"></i>
                <span data-i18n="error.general">Error al cargar la lista</span>
                <div style="font-size:12px;color:rgba(255,255,255,0.15);margin-top:8px;">${error.message}</div>
            </div>
        `;
    }
}

// ============================================================
// 🔥 DESBLOQUEAR USUARIO
// ============================================================

async function unblockUser(userId) {
    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para desbloquear usuarios', true);
        return;
    }

    const user = currentUserData;
    const blockedUser = document.querySelector(`.blocked-item[data-userid="${userId}"]`);
    const userName = blockedUser?.querySelector('.user-name')?.textContent || 'Usuario';

    if (!confirm(`¿Estás seguro de que quieres desbloquear a ${userName}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/blocked/unblock/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Error al desbloquear');
        }

        showToast(`✅ Has desbloqueado a ${userName}`, false);
        
        if (blockedUser) {
            blockedUser.remove();
        }
        
        const remaining = document.querySelectorAll('.blocked-item').length;
        const badge = document.getElementById('blockedBadge');
        if (badge) badge.textContent = remaining;
        
        const titleSpan = document.querySelector('.edit-section-title span:last-child');
        if (titleSpan) titleSpan.textContent = `${remaining} bloqueados`;

        if (currentUserData && currentUserData.blocked) {
            currentUserData.blocked = currentUserData.blocked.filter(id => id !== userId);
        }

        if (remaining === 0) {
            loadBlockedList();
        }

    } catch (error) {
        console.error('Error unblocking user:', error);
        showToast(`❌ ${error.message || 'Error al desbloquear'}`, true);
    }
}

// ============================================================
// 🔥 MANEJAR CIERRE DE SESIÓN
// ============================================================

function handleLogout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        closeEditProfileModal();
        
        const storyModal = document.getElementById('storyModalOverlay');
        if (storyModal) storyModal.classList.remove('active');
        
        const profileModal = document.getElementById('profileModalOverlay');
        if (profileModal) profileModal.classList.remove('active');
        
        import('./auth.js').then(({ logout }) => {
            logout();
            showToast('👋 Sesión cerrada', false);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
        }).catch(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        });
    }
}

// ============================================================
// VALIDAR NOMBRE DE USUARIO
// ============================================================

function validateUsername(username) {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    return regex.test(username);
}

// ============================================================
// CALCULAR DÍAS RESTANTES PARA CAMBIAR USERNAME
// ============================================================

function getDaysUntilNextChange(lastChangeDate) {
    if (!lastChangeDate) return 0;
    const lastChange = new Date(lastChangeDate);
    const now = new Date();
    const diff = now - lastChange;
    const daysPassed = diff / (24 * 60 * 60 * 1000);
    const daysRemaining = Math.ceil(7 - daysPassed);
    return Math.max(0, daysRemaining);
}

// ============================================================
// SELECCIONAR PRIVACIDAD
// ============================================================

function selectEditPrivacy(privacy) {
    window._selectedPrivacy = privacy;
    document.querySelectorAll('.privacy-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.privacy === privacy);
    });
}

// ============================================================
// SOLICITAR CUENTA DE EMPRESA
// ============================================================

function requestBusinessAccount() {
    const user = getCurrentUser();
    if (user?.role === 'admin') {
        showToast('👑 Los administradores no necesitan solicitar cuenta de empresa', false);
        return;
    }
    
    const overlay = document.getElementById('businessRequestOverlay');
    if (!overlay) {
        createBusinessRequestModal();
    }
    document.getElementById('businessRequestOverlay').classList.add('active');
}

// ============================================================
// CREAR MODAL DE SOLICITUD DE EMPRESA
// ============================================================

function createBusinessRequestModal() {
    const html = `
        <div id="businessRequestOverlay" class="business-request-overlay" onclick="window.closeBusinessRequestModal()">
            <div class="business-request-content" onclick="event.stopPropagation()">
                <div class="business-request-header">
                    <span class="title"><i class="fas fa-store"></i> <span data-i18n="profile.businessRequest">Solicitar cuenta de empresa</span></span>
                    <button class="close-btn" onclick="window.closeBusinessRequestModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="business-request-body">
                    <div class="business-request-info">
                        <p data-i18n="profile.businessRequestInfo">Completa la información para solicitar tu cuenta de empresa. Será revisada por el equipo de moderación.</p>
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessName">Nombre de la empresa <span class="required">*</span></label>
                        <input type="text" id="bizName" data-i18n-placeholder="profile.businessNamePlaceholder" placeholder="Ej: Mi Empresa S.A." maxlength="50">
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessType">Tipo de empresa <span class="required">*</span></label>
                        <select id="bizType">
                            <option value="" data-i18n="profile.businessSelect">Selecciona...</option>
                            <option value="technology" data-i18n="profile.businessTech">Tecnología</option>
                            <option value="retail" data-i18n="profile.businessRetail">Comercio / Retail</option>
                            <option value="food" data-i18n="profile.businessFood">Alimentos / Restaurantes</option>
                            <option value="education" data-i18n="profile.businessEducation">Educación</option>
                            <option value="health" data-i18n="profile.businessHealth">Salud</option>
                            <option value="finance" data-i18n="profile.businessFinance">Finanzas</option>
                            <option value="entertainment" data-i18n="profile.businessEntertainment">Entretenimiento</option>
                            <option value="art" data-i18n="profile.businessArt">Arte / Cultura</option>
                            <option value="sports" data-i18n="profile.businessSports">Deportes</option>
                            <option value="other" data-i18n="profile.businessOther">Otro</option>
                        </select>
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessDescription">Descripción</label>
                        <textarea id="bizDescription" rows="3" data-i18n-placeholder="profile.businessDescriptionPlaceholder" placeholder="Describe tu empresa..." maxlength="500"></textarea>
                        <div class="edit-helper"><span id="bizDescCount">0</span>/500 <span data-i18n="profile.characters">caracteres</span></div>
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessWebsite">Sitio web</label>
                        <input type="url" id="bizWebsite" data-i18n-placeholder="profile.businessWebsitePlaceholder" placeholder="https://tusitio.com">
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessPhone">Teléfono</label>
                        <input type="tel" id="bizPhone" data-i18n-placeholder="profile.businessPhonePlaceholder" placeholder="+1234567890">
                    </div>

                    <div class="edit-group">
                        <label data-i18n="profile.businessAddress">Dirección</label>
                        <input type="text" id="bizAddress" data-i18n-placeholder="profile.businessAddressPlaceholder" placeholder="Dirección de la empresa">
                    </div>

                    <button class="submit-business-request" id="submitBusinessRequestBtn" data-i18n="profile.businessSubmit">
                        <i class="fas fa-paper-plane"></i> Enviar solicitud
                    </button>
                    <div id="businessRequestStatus" class="business-request-status" style="display:none;"></div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('submitBusinessRequestBtn')?.addEventListener('click', submitBusinessRequest);

    document.getElementById('bizDescription')?.addEventListener('input', function() {
        const count = document.getElementById('bizDescCount');
        if (count) {
            count.textContent = this.value.length;
        }
    });
}

// ============================================================
// CERRAR MODAL DE SOLICITUD DE EMPRESA
// ============================================================

function closeBusinessRequestModal() {
    const overlay = document.getElementById('businessRequestOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// ============================================================
// ENVIAR SOLICITUD DE EMPRESA
// ============================================================

async function submitBusinessRequest() {
    const name = document.getElementById('bizName')?.value.trim();
    const type = document.getElementById('bizType')?.value;
    const description = document.getElementById('bizDescription')?.value.trim();
    const website = document.getElementById('bizWebsite')?.value.trim();
    const phone = document.getElementById('bizPhone')?.value.trim();
    const address = document.getElementById('bizAddress')?.value.trim();

    const statusEl = document.getElementById('businessRequestStatus');

    if (!name) {
        statusEl.style.display = 'block';
        statusEl.className = 'business-request-status error';
        statusEl.textContent = '❌ El nombre de la empresa es requerido';
        return;
    }

    if (!type) {
        statusEl.style.display = 'block';
        statusEl.className = 'business-request-status error';
        statusEl.textContent = '❌ Selecciona un tipo de empresa';
        return;
    }

    const token = getToken();
    if (!token) {
        showToast('Inicia sesión para solicitar', true);
        return;
    }

    statusEl.style.display = 'block';
    statusEl.className = 'business-request-status loading';
    statusEl.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Enviando solicitud...';

    try {
        const res = await fetch(`${API_URL}/api/verified/business/request`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                businessName: name,
                businessType: type,
                description: description || '',
                website: website || null,
                phone: phone || null,
                address: address || null
            })
        });

        const data = await res.json();

        if (res.ok) {
            statusEl.className = 'business-request-status success';
            statusEl.innerHTML = `✅ ${data.message || 'Solicitud enviada correctamente'}`;
            
            isBusinessRequestSent = true;
            
            const section = document.querySelector('.business-request-section');
            if (section) {
                section.innerHTML = `
                    <div class="edit-section-title"><i class="fas fa-building"></i> <span data-i18n="profile.businessRequest">Solicitar cuenta de empresa</span></div>
                    <div class="business-request-sent">
                        <i class="fas fa-check-circle" style="color:#4ade80;"></i>
                        <span style="color:#4ade80;font-weight:500;">✅ <span data-i18n="profile.businessRequestSent">Solicitud enviada</span></span>
                        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;"><span data-i18n="profile.businessRequestPending">Tu solicitud está siendo revisada por el equipo de moderación</span></div>
                    </div>
                `;
            }

            setTimeout(() => {
                closeBusinessRequestModal();
                showToast('✅ Solicitud de empresa enviada', false);
            }, 2000);
        } else {
            statusEl.className = 'business-request-status error';
            statusEl.textContent = `❌ ${data.error || 'Error al enviar solicitud'}`;
        }
    } catch (error) {
        console.error('Error submitting business request:', error);
        statusEl.className = 'business-request-status error';
        statusEl.textContent = '❌ Error de conexión';
    }
}

// ============================================================
// FORZAR ASIGNACIÓN A WINDOW
// ============================================================

if (typeof window !== 'undefined') {
    window.openEditProfileModal = openEditProfileModal;
    window.closeEditProfileModal = closeEditProfileModal;
    window.handleLogout = handleLogout;
    window.switchEditTab = switchEditTab;
    window.unblockUser = unblockUser;
    window.loadBlockedList = loadBlockedList;
    window.downgradeBusinessAccount = downgradeBusinessAccount;
    console.log('✅ edit-profile-modal: Funciones asignadas a window');
}