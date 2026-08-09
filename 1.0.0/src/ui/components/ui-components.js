/**
 * Complete Material Design 3 UI Component Library for DC Ultimate UI
 */

export function createButton(text, type = 'primary', onClick = null) {
  const btn = document.createElement('button');
  btn.className = `md3-button md3-button--${type}`;
  btn.textContent = text;

  if (typeof onClick === 'function') {
    btn.addEventListener('click', onClick);
  }
  return btn;
}

export function createSwitch(id, checked = false, onChange = null) {
  const wrapper = document.createElement('label');
  wrapper.className = 'md3-switch';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.checked = checked;

  const slider = document.createElement('span');
  slider.className = 'md3-switch-slider';

  const thumb = document.createElement('span');
  thumb.className = 'md3-switch-thumb';

  input.addEventListener('change', (e) => {
    if (typeof onChange === 'function') {
      onChange(e.target.checked);
    }
  });

  slider.appendChild(thumb);
  wrapper.appendChild(input);
  wrapper.appendChild(slider);
  return wrapper;
}

export function createChip(text, type = 'primary') {
  const chip = document.createElement('span');
  chip.className = `md3-chip md3-chip-${type}`;
  chip.textContent = text;
  return chip;
}

export function createSnackbar(message, duration = 3000) {
  const bar = document.createElement('div');
  bar.className = 'md3-snackbar';
  bar.textContent = message;
  document.body.appendChild(bar);

  // Force reflow before adding the 'show' class so the transition runs
  void bar.offsetWidth; 
  bar.classList.add('show');

  setTimeout(() => {
    bar.classList.remove('show');
    setTimeout(() => bar.remove(), 250);
  }, duration);
}
