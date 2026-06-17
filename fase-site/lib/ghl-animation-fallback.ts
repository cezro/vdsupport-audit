function getFadeInClassName(element: HTMLElement): string | null {
  for (const className of element.classList) {
    if (className.startsWith("heading-")) {
      return `animate__fadeIn-${className}`;
    }

    if (className.startsWith("sub-heading-")) {
      return `animate__fadeIn-${className}`;
    }

    if (className.startsWith("cheading-")) {
      return `animate__fadeIn-${className.slice(1)}`;
    }

    if (className.startsWith("csub-heading-")) {
      return `animate__fadeIn-${className.slice(1)}`;
    }
  }

  return null;
}

export function revealGhlAnimations(root: HTMLElement): number {
  let revealed = 0;

  for (const element of root.querySelectorAll<HTMLElement>(".text-output")) {
    if (getComputedStyle(element).opacity !== "0") {
      continue;
    }

    const fadeInClass = getFadeInClassName(element);
    if (!fadeInClass) {
      element.style.opacity = "1";
      revealed += 1;
      continue;
    }

    element.classList.add("animate__animated", fadeInClass);
    revealed += 1;
  }

  return revealed;
}

export function scheduleAnimationFallback(root: HTMLElement): () => void {
  const reveal = () => {
    revealGhlAnimations(root);
  };

  reveal();
  const frame = requestAnimationFrame(reveal);
  const shortTimer = window.setTimeout(reveal, 500);
  const longTimer = window.setTimeout(reveal, 2000);

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(shortTimer);
    window.clearTimeout(longTimer);
  };
}
