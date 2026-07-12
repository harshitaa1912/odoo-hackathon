/* ============================================
   TransitOps – Login Page Logic
   ============================================ */
'use strict';

// Redirect if already logged in
if (Auth.isLoggedIn()) { window.location.href = 'app.html'; }

const loginForm    = document.getElementById('loginForm');
const emailInput   = document.getElementById('emailInput');
const passwordInput= document.getElementById('passwordInput');
const roleSelect   = document.getElementById('roleSelect');
const signInBtn    = document.getElementById('signInBtn');
const errorPopup   = document.getElementById('errorPopup');
const errorMsg     = document.getElementById('errorMsg');

/* Show / hide error popup */
function showError(msg) {
  errorMsg.textContent = msg;
  errorPopup.classList.add('visible');
  emailInput.classList.add('error');
}
function hideError() {
  errorPopup.classList.remove('visible');
  emailInput.classList.remove('error');
}

/* Clear error on typing */
[emailInput, passwordInput].forEach(el => el.addEventListener('input', hideError));

/* Form submit */
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  const role     = roleSelect.value;

  /* Basic front-end validation */
  if (!email || !password || !role) {
    showError('Please fill in all fields including your role.'); return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError('Please enter a valid email address.'); return;
  }

  const result = Auth.login(email, password, role);

  if (result.ok) {
    signInBtn.textContent = 'Signing in…';
    signInBtn.disabled = true;
    hideError();
    setTimeout(() => { window.location.href = 'app.html'; }, 400);
  } else {
    showError(result.msg);
    passwordInput.value = '';
    passwordInput.focus();
  }
});

/* Forgot password (demo) */
document.getElementById('forgotLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  alert('Demo credentials:\n\nfleet@transitops.in   / fleet123\nraven@transitops.in   / raven123\nsafety@transitops.in  / safety123\nfinance@transitops.in / finance123');
});
