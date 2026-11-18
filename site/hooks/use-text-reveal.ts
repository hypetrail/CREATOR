'use client';

import {useEffect, type RefObject} from 'react';

const textTargets = '.go-section-heading h2, .go-section-heading p, .go-model-heading h3, .go-model-description, .go-booking-heading h2, .go-store-hours, .go-weekend-offer, .go-rental-heading h3';

/** Reveal introductory text once on entry; content stays visible without JS. */
export function useTextReveal(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element || !('IntersectionObserver' in window)) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observed = new WeakSet<Element>();
    const animations = new Set<Animation>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (reducedMotion.matches || typeof entry.target.animate !== 'function') continue;
        const animation = entry.target.animate([
          {opacity: .35, filter: 'blur(4px)', transform: 'translateY(10px)'},
          {opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)'},
        ], {duration: 550, easing: 'cubic-bezier(.22,1,.36,1)'});
        animations.add(animation);
        animation.onfinish = animation.oncancel = () => animations.delete(animation);
      }
    }, {threshold: .15});
    const observeTexts = () => {
      element.querySelectorAll(textTargets).forEach(text => {
        if (observed.has(text)) return;
        observed.add(text);
        observer.observe(text);
      });
    };
    const stopMotion = () => {
      if (reducedMotion.matches) animations.forEach(animation => animation.cancel());
    };
    observeTexts();
    // New reservation steps and asynchronously loaded models join the same observer.
    const mutations = new MutationObserver(observeTexts);
    mutations.observe(element, {childList: true, subtree: true});
    reducedMotion.addEventListener('change', stopMotion);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      reducedMotion.removeEventListener('change', stopMotion);
      animations.forEach(animation => animation.cancel());
    };
  }, [root]);
}
