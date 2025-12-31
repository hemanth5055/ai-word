function showPopup(selectedText) {
  const existingPopup = document.getElementById('text-selection-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // Create popup element
  const popup = document.createElement('div');
  popup.id = 'text-selection-popup';
  
  popup.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #555; padding-bottom: 8px;">
      "${selectedText}"
    </div>
    <div id="popup-meaning" style="font-size: 14px; line-height: 1.5;">
      Loading meaning...
    </div>
  `;
  
  popup.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background-color: #333;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    animation: slideIn 0.3s ease-out;
    max-width: 350px;
    max-height: 400px;
    overflow-y: auto;
  `;

  if (!document.getElementById('popup-animation-style')) {
    const style = document.createElement('style');
    style.id = 'popup-animation-style';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes fadeOut {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      #text-selection-popup::-webkit-scrollbar {
        width: 8px;
      }
      #text-selection-popup::-webkit-scrollbar-track {
        background: #444;
        border-radius: 4px;
      }
      #text-selection-popup::-webkit-scrollbar-thumb {
        background: #666;
        border-radius: 4px;
      }
      #text-selection-popup::-webkit-scrollbar-thumb:hover {
        background: #777;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(popup);

  chrome.runtime.sendMessage(
    { type: "AI_MEANING", word: selectedText },
    (response) => {
      const meaningDiv = document.getElementById('popup-meaning');
      if (meaningDiv && response && response.meaning) {
        meaningDiv.textContent = response.meaning;
      } else if (meaningDiv) {
        meaningDiv.textContent = "Could not fetch meaning. Please try again.";
      }
    }
  );

  setTimeout(() => {
    if (popup.parentNode) {
      popup.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        if (popup.parentNode) {
          popup.remove();
        }
      }, 300);
    }
  }, 10000);
  
  // Add close button functionality (click anywhere on popup to close)
  popup.addEventListener('click', () => {
    popup.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      if (popup.parentNode) {
        popup.remove();
      }
    }, 300);
  });
}


function handleTextSelection() {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 0) {
    showPopup(selectedText);
  }
}

document.addEventListener('mouseup', handleTextSelection);

// Also listen for keyup event (for keyboard selection)
document.addEventListener('keyup', (e) => {
  if (e.shiftKey || e.key === 'Shift') {
    handleTextSelection();
  }
});



console.log('Text selection popup extension loaded!');