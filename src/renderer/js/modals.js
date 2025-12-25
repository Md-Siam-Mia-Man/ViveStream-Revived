// src/js/modals.js
const confirmationModal = document.getElementById('confirmation-modal');
const confirmModalTitle = document.getElementById('modal-title');
const confirmModalText = document.getElementById('modal-text');
const confirmModalConfirmBtn = document.getElementById('modal-confirm-btn');
const confirmModalCancelBtn = document.getElementById('modal-cancel-btn');
let onConfirmAction = null;

const promptModal = document.getElementById('prompt-modal');
const promptModalTitle = document.getElementById('prompt-title');
const promptModalText = document.getElementById('prompt-text');
const promptModalInput = document.getElementById('prompt-input');
const promptModalConfirmBtn = document.getElementById('prompt-confirm-btn');
const promptModalCancelBtn = document.getElementById('prompt-cancel-btn');

/**
 * Shows a confirmation dialog.
 * @param {string} title - The title of the modal.
 * @param {string} text - The descriptive text of the modal.
 * @param {Function} confirmAction - The function to call when the user confirms.
 */
export function showConfirmationModal(title, text, confirmAction) {
  confirmModalTitle.textContent = title;
  confirmModalText.innerHTML = text;
  onConfirmAction = confirmAction;
  confirmationModal.classList.remove('hidden');
}

confirmModalCancelBtn.addEventListener('click', () => {
  confirmationModal.classList.add('hidden');
  onConfirmAction = null;
});

confirmModalConfirmBtn.addEventListener('click', () => {
  if (typeof onConfirmAction === 'function') onConfirmAction();
  confirmationModal.classList.add('hidden');
  onConfirmAction = null;
});

/**
 * Shows a dialog that prompts the user for text input.
 * @param {string} title - The title of the modal.
 * @param {string} text - The descriptive text of the modal.
 * @param {string} [defaultValue=''] - The default value for the input field.
 * @returns {Promise<string|null>} A promise that resolves with the user's input, or null if cancelled.
 */
export function showPromptModal(title, text, defaultValue = '') {
  return new Promise((resolve) => {
    promptModalTitle.textContent = title;
    promptModalText.textContent = text;
    promptModalInput.value = defaultValue;
    promptModal.classList.remove('hidden');
    promptModalInput.focus();
    promptModalInput.select();

    const confirmHandler = () => {
      promptModal.classList.add('hidden');
      resolve(promptModalInput.value);
      cleanup();
    };

    const cancelHandler = () => {
      promptModal.classList.add('hidden');
      resolve(null); // Resolve with null on cancel
      cleanup();
    };

    const keydownHandler = (e) => {
      if (e.key === 'Enter') {
        confirmHandler();
      } else if (e.key === 'Escape') {
        cancelHandler();
      }
    };

    const cleanup = () => {
      promptModalConfirmBtn.removeEventListener('click', confirmHandler);
      promptModalCancelBtn.removeEventListener('click', cancelHandler);
      promptModalInput.removeEventListener('keydown', keydownHandler);
    };

    promptModalConfirmBtn.addEventListener('click', confirmHandler);
    promptModalCancelBtn.addEventListener('click', cancelHandler);
    promptModalInput.addEventListener('keydown', keydownHandler);
  });
}
