const navToggle = document.querySelector("[data-nav-toggle]");
const siteNav = document.querySelector("[data-site-nav]");

function setupScroll() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lenisSrc = "https://unpkg.com/lenis@1.1.20/dist/lenis.min.js";
  const isArchive = document.body?.classList.contains("archive-page");
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  if (isArchive) {
    document.documentElement.classList.add("is-archive-page");
  }

  if (isArchive || isTouch || reduceMotion.matches || window.__ap4Lenis) {
    return;
  }

  const startLenis = () => {
    if (!window.Lenis || window.__ap4Lenis || reduceMotion.matches) {
      return;
    }

    const lenis = new window.Lenis({
      lerp: 0.1,
      wheelMultiplier: 0.78,
      touchMultiplier: 0.9,
      syncTouch: true,
      syncTouchLerp: 0.1,
      touchInertiaMultiplier: 4.5,
      smoothWheel: true,
      gestureOrientation: "vertical",
      overscroll: false,
      prevent: (node) => Boolean(node.closest(
        "input, textarea, select, [data-lenis-prevent], .slider, .archive-fullscreen, .archive-fullscreen__track"
      )),
    });

    let frame = null;

    const raf = (time) => {
      lenis.raf(time);
      frame = window.requestAnimationFrame(raf);
    };

    frame = window.requestAnimationFrame(raf);
    window.__ap4Lenis = lenis;

    const stopOnReducedMotion = (event) => {
      if (!event.matches) {
        return;
      }

      window.cancelAnimationFrame(frame);
      lenis.destroy();
      window.__ap4Lenis = null;
    };

    if (typeof reduceMotion.addEventListener === "function") {
      reduceMotion.addEventListener("change", stopOnReducedMotion, { once: true });
    } else if (typeof reduceMotion.addListener === "function") {
      reduceMotion.addListener(stopOnReducedMotion);
    }
  };

  if (window.Lenis) {
    startLenis();
    return;
  }

  const script = document.createElement("script");
  script.src = lenisSrc;
  script.async = true;
  script.onload = startLenis;
  document.head.append(script);
}

setupScroll();

function setupSound() {
  const audioStateKey = "ap4-site-audio-enabled";
  const audioTimeKey = "ap4-site-audio-time";
  const maxVolume = 0.024;
  const fadeDuration = 650;
  const inPages = window.location.pathname.split("/").includes("pages");
  const audioSrc = `${inPages ? "../" : ""}Echoes from the Deep (1).mp3`;
  const siteAudio = document.querySelector("[data-site-audio]") || document.createElement("audio");
  const soundToggle = document.querySelector("[data-sound-toggle]") || document.createElement("button");
  const readStore = (storage, key) => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };
  const saveStore = (storage, key, value) => {
    try {
      storage.setItem(key, value);
    } catch {
    }
  };
  let isSoundEnabled = readStore(window.localStorage, audioStateKey) !== "false";
  let fadeFrame = null;

  if (!siteAudio.isConnected) {
    siteAudio.dataset.siteAudio = "";
    siteAudio.autoplay = true;
    siteAudio.preload = "auto";
    siteAudio.loop = true;
    document.body.prepend(siteAudio);
  }

  if (!soundToggle.isConnected) {
    soundToggle.className = "sound-toggle";
    soundToggle.type = "button";
    soundToggle.dataset.soundToggle = "";
    document.body.prepend(soundToggle);
  }

  siteAudio.src = audioSrc;
  siteAudio.volume = 0;

  const restoreAudioTime = () => {
    const savedTime = Number(readStore(window.sessionStorage, audioTimeKey));

    if (Number.isFinite(savedTime) && savedTime > 0 && siteAudio.duration) {
      siteAudio.currentTime = savedTime % siteAudio.duration;
    }
  };

  const syncSoundButton = () => {
    soundToggle.classList.toggle("is-sound-on", isSoundEnabled);
    soundToggle.setAttribute("aria-pressed", String(isSoundEnabled));
    soundToggle.setAttribute("aria-label", isSoundEnabled ? "Выключить звук" : "Включить звук");
  };

  const fadeAudioTo = (targetVolume, options = {}) => {
    window.cancelAnimationFrame(fadeFrame);

    const startVolume = siteAudio.volume;
    const startTime = performance.now();
    const duration = options.immediate ? 0 : fadeDuration;

    const tick = (time) => {
      const progress = duration === 0 ? 1 : Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      siteAudio.volume = startVolume + (targetVolume - startVolume) * eased;

      if (progress < 1) {
        fadeFrame = window.requestAnimationFrame(tick);
        return;
      }

      siteAudio.volume = targetVolume;

      if (targetVolume === 0) {
        siteAudio.pause();
      }
    };

    fadeFrame = window.requestAnimationFrame(tick);
  };

  const playSiteAudio = (options = {}) => {
    const playPromise = siteAudio.play();

    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => fadeAudioTo(maxVolume, options))
        .catch(() => {
        });
      return;
    }

    fadeAudioTo(maxVolume, options);
  };

  const duckSiteAudio = () => {
    if (isSoundEnabled && !siteAudio.paused) {
      fadeAudioTo(maxVolume * 0.18);
    }
  };

  const restoreSiteAudio = () => {
    if (isSoundEnabled) {
      playSiteAudio();
    }
  };

  const handleFirstAudioGesture = () => {
    if (isSoundEnabled && siteAudio.paused) {
      playSiteAudio();
    }
  };

  const saveAudioTime = () => {
    if (Number.isFinite(siteAudio.currentTime)) {
      saveStore(window.sessionStorage, audioTimeKey, String(siteAudio.currentTime));
    }
  };

  syncSoundButton();
  window.__ap4SiteAudio = {
    duck: duckSiteAudio,
    restore: restoreSiteAudio,
  };
  siteAudio.addEventListener("loadedmetadata", restoreAudioTime, { once: true });
  siteAudio.load();

  if (siteAudio.readyState >= 1) {
    restoreAudioTime();
  }

  if (isSoundEnabled) {
    playSiteAudio();
  }

  const saveTimer = window.setInterval(saveAudioTime, 250);

  window.addEventListener("pagehide", () => {
    saveAudioTime();
    window.clearInterval(saveTimer);
  });

  window.addEventListener("pointerdown", handleFirstAudioGesture, { once: true });
  window.addEventListener("keydown", handleFirstAudioGesture, { once: true });

  soundToggle.addEventListener("click", () => {
    isSoundEnabled = !isSoundEnabled;
    saveStore(window.localStorage, audioStateKey, String(isSoundEnabled));
    syncSoundButton();

    if (isSoundEnabled) {
      playSiteAudio();
    } else {
      fadeAudioTo(0);
    }
  });

  let isNavigating = false;
  const fadeThenNavigate = (callback, waitBeforeNavigate = null) => {
    if (isNavigating) {
      return;
    }

    isNavigating = true;
    saveAudioTime();

    const shouldFadeAudio = isSoundEnabled && !siteAudio.paused;
    const waitDuration = waitBeforeNavigate ?? (shouldFadeAudio ? fadeDuration : 0);

    if (shouldFadeAudio) {
      fadeAudioTo(0);
    }

    window.setTimeout(callback, waitDuration);
  };

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest("a[href]");

    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (link.target && link.target !== "_self") {
      return;
    }

    const url = new URL(link.href, window.location.href);
    const isSamePageHash = url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search && url.hash;

    if (url.origin !== window.location.origin || isSamePageHash || link.hasAttribute("download")) {
      return;
    }

    event.preventDefault();
    fadeThenNavigate(() => {
      window.location.href = url.href;
    });
  });

  document.addEventListener("submit", (event) => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement) || event.defaultPrevented) {
      return;
    }

    event.preventDefault();
    const contactScreen = form.closest(".contact-screen");

    if (contactScreen) {
      contactScreen.classList.add("is-submitting");
    }

    fadeThenNavigate(() => {
      form.submit();
    }, contactScreen ? 860 : null);
  });
}

setupSound();

function setupCenterPage() {
  const centerPage = document.querySelector("[data-center-page]");

  if (!centerPage) {
    return;
  }

  const title = centerPage.querySelector("[data-center-title]");
  const description = centerPage.querySelector("[data-center-description]");
  const nextButton = centerPage.querySelector("[data-center-next]");
  const statsList = centerPage.querySelector(".center-stats");
  const videos = Array.from(centerPage.querySelectorAll("[data-center-video]"));
  const statLabels = Array.from(centerPage.querySelectorAll("[data-center-stat-label]"));
  const statValues = Array.from(centerPage.querySelectorAll("[data-center-stat-value]"));
  const states = [
    {
      title: "AURORA-7",
      description: "Автономная машина для разведки поверхности, сбора образцов и движения по сложному каменистому рельефу. Используется там, где человеку находиться опасно или невозможно.",
      stats: [
        ["Запас хода", "38,6 км"],
        ["Готовность", "82%"],
        ["Темп. среды", "55°C"],
        ["Давление на ось", "12,4 kN"],
        ["Задержка связи", "4м 34с"],
      ],
    },
    {
      title: "SKYLINE-X3",
      description: "Высотный летательный аппарат для быстрого осмотра больших территорий, поиска маршрутов и передачи данных на базу. Подходит для работы в сложных погодных условиях и на большой высоте.",
      stats: [
        ["Дальность", "1240 км"],
        ["Готовность", "91%"],
        ["Темп. корпуса", "17°C"],
        ["Тяга", "87%"],
        ["Отклик", "1,2 с"],
      ],
    },
  ];
  let activeIndex = 0;
  let isChanging = false;

  const paintState = (index) => {
    const state = states[index];

    title.textContent = state.title;
    description.textContent = state.description;
    statsList?.setAttribute("aria-label", `Показатели ${state.title}`);
    statLabels.forEach((label, statIndex) => {
      label.textContent = state.stats[statIndex]?.[0] || "";
    });
    statValues.forEach((value, statIndex) => {
      value.textContent = state.stats[statIndex]?.[1] || "";
    });
  };

  const activateVideo = (index) => {
    videos.forEach((video, videoIndex) => {
      const isActive = videoIndex === index;

      video.classList.toggle("is-active", isActive);
      if (isActive) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  };

  activateVideo(activeIndex);

  nextButton?.addEventListener("click", () => {
    if (isChanging) {
      return;
    }

    isChanging = true;
    activeIndex = (activeIndex + 1) % states.length;
    centerPage.classList.add("is-changing");
    activateVideo(activeIndex);

    window.setTimeout(() => {
      paintState(activeIndex);
      centerPage.classList.remove("is-changing");
      window.setTimeout(() => {
        isChanging = false;
      }, 240);
    }, 180);
  });
}

setupCenterPage();

function setupContactParticles() {
  const contactScreens = document.querySelectorAll(".contact-screen");

  contactScreens.forEach((screen) => {
    const particleLayer = screen.querySelector("[data-contact-particles]");

    if (!particleLayer || particleLayer.children.length) {
      return;
    }

    const isCompact = window.matchMedia("(max-width: 760px)").matches;
    const particleCount = isCompact ? 34 : 58;

    for (let index = 0; index < particleCount; index += 1) {
      const particle = document.createElement("span");
      const isLeftSide = index % 2 === 0;
      const x = isLeftSide
        ? 4 + Math.random() * 18
        : 78 + Math.random() * 18;
      const y = 8 + Math.random() * 84;
      const size = 1.2 + Math.random() * 2.8;
      const opacity = 0.12 + Math.random() * 0.28;
      const driftX = (Math.random() * 22 + 8) * (isLeftSide ? 1 : -1);
      const driftY = Math.random() * 24 - 12;
      const submitX = Math.random() * 56 - 28;
      const submitY = Math.random() * 56 - 28;
      const duration = 2600 + Math.random() * 2600;

      particle.className = "contact-particle";
      particle.style.setProperty("--particle-x", `${x.toFixed(2)}%`);
      particle.style.setProperty("--particle-y", `${y.toFixed(2)}%`);
      particle.style.setProperty("--particle-size", `${size.toFixed(2)}px`);
      particle.style.setProperty("--particle-opacity", opacity.toFixed(2));
      particle.style.setProperty("--particle-drift-x", `${driftX.toFixed(2)}px`);
      particle.style.setProperty("--particle-drift-y", `${driftY.toFixed(2)}px`);
      particle.style.setProperty("--particle-submit-x", `${submitX.toFixed(2)}px`);
      particle.style.setProperty("--particle-submit-y", `${submitY.toFixed(2)}px`);
      particle.style.setProperty("--particle-duration", `${duration.toFixed(0)}ms`);
      particleLayer.append(particle);
    }

    const form = screen.querySelector(".contact-form");

    form?.addEventListener("submit", () => {
      screen.classList.add("is-submitting");
    });
  });
}

setupContactParticles();

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navToggle.classList.toggle("is-open", !isOpen);
    siteNav.classList.toggle("is-open", !isOpen);
  });

  siteNav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.classList.remove("is-open");
      siteNav.classList.remove("is-open");
    }
  });
}

const revealSections = document.querySelectorAll("[data-reveal-section]");

if (revealSections.length) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    {
      threshold: 0.34,
      rootMargin: "0px 0px -12% 0px",
    }
  );

  revealSections.forEach((section) => revealObserver.observe(section));
}

const flagScrollScene = document.querySelector("[data-flag-scroll]");

if (flagScrollScene) {
  const flagScreen = flagScrollScene.querySelector(".flag-screen");
  const flagVisualEase = 0.055;
  let ticking = false;
  let targetVisualProgress = 0;
  let currentVisualProgress = 0;
  let visualFrame = null;

  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

  const animateFlagVisual = () => {
    if (!flagScreen) {
      visualFrame = null;
      return;
    }

    currentVisualProgress += (targetVisualProgress - currentVisualProgress) * flagVisualEase;

    if (Math.abs(targetVisualProgress - currentVisualProgress) < 0.001) {
      currentVisualProgress = targetVisualProgress;
    }

    flagScreen.style.setProperty("--flag-visual-progress", currentVisualProgress.toFixed(4));

    if (currentVisualProgress !== targetVisualProgress) {
      visualFrame = window.requestAnimationFrame(animateFlagVisual);
      return;
    }

    visualFrame = null;
  };

  const updateFlagScene = () => {
    if (!flagScreen) {
      return;
    }

    const viewportHeight = Math.max(window.innerHeight, 1);
    const sceneRect = flagScrollScene.getBoundingClientRect();
    const scrollableDistance = Math.max(flagScrollScene.offsetHeight - viewportHeight, 1);
    const localScroll = clamp(-sceneRect.top, 0, scrollableDistance);
    const sceneProgress = clamp(localScroll / scrollableDistance);
    const isMobileFlagScene = window.matchMedia("(max-width: 760px)").matches;
    const finalStart = viewportHeight * (isMobileFlagScene ? 0.42 : 1.5);
    const initialFadeDistance = viewportHeight * (isMobileFlagScene ? 0.24 : 0.35);
    const finalFadeDistance = viewportHeight * (isMobileFlagScene ? 0.28 : 0.55);
    const initialExitProgress = clamp((localScroll - finalStart) / initialFadeDistance);
    const finalProgress = clamp((localScroll - finalStart - initialFadeDistance) / finalFadeDistance);
    const isSceneInView = sceneRect.top < window.innerHeight * 0.75 && sceneRect.bottom > 0;

    flagScreen.style.setProperty("--flag-progress", sceneProgress.toFixed(3));
    flagScreen.style.setProperty("--flag-initial-opacity", (1 - initialExitProgress).toFixed(3));
    flagScreen.style.setProperty("--flag-initial-y", `${(-24 * initialExitProgress).toFixed(1)}px`);
    flagScreen.style.setProperty("--flag-final-progress", finalProgress.toFixed(3));
    targetVisualProgress = finalProgress;
    if (!visualFrame) {
      visualFrame = window.requestAnimationFrame(animateFlagVisual);
    }
    flagScreen.classList.toggle("is-visible", isSceneInView);
    flagScreen.classList.toggle("is-final", finalProgress > 0.02);
    document.body.classList.toggle("flag-scene-final", finalProgress > 0.25);
  };

  const requestFlagUpdate = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(() => {
      updateFlagScene();
      ticking = false;
    });
  };

  updateFlagScene();
  window.addEventListener("scroll", requestFlagUpdate, { passive: true });
  window.addEventListener("resize", requestFlagUpdate);
}

const fanSection = document.querySelector("[data-fan-section]");

if (fanSection) {
  const fanObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          fanSection.classList.add("is-visible");
          fanObserver.unobserve(fanSection);
        }
      });
    },
    {
      threshold: 0.38,
      rootMargin: "0px 0px -10% 0px",
    }
  );

  fanObserver.observe(fanSection);
}

const expeditions = [
  {
    id: 1,
    label: "Экспедиция 1",
    shortLabel: "01",
    title: "Экспедиция 1",
    description: "Найдены выцветшие плакаты со странными схемами. Похоже на инструкции, но порядок действий нарушен.",
    glow: "../assets/images/archive/01/glow.png",
    images: [
      { src: "../assets/images/archive/01/poster-1-2.jpg", alt: "Материал экспедиции 1, карточка 1" },
      { src: "../assets/images/archive/01/poster-2-1.jpg", alt: "Материал экспедиции 1, карточка 2" },
      { src: "../assets/images/archive/01/poster-3-1 1.jpg", alt: "Материал экспедиции 1, карточка 3" },
    ],
  },
  {
    id: 2,
    label: "Экспедиция 2",
    shortLabel: "02",
    title: "Экспедиция 2",
    description: "Обнаружены фрагменты неизвестной письменности. Символы повторяются, но ключ к шифру не найден.",
    glow: "../assets/images/archive/02/glow.png",
    images: [
      { src: "../assets/images/archive/02/1-1.jpg", alt: "Материал экспедиции 2, карточка 1" },
      { src: "../assets/images/archive/02/1-2.jpg", alt: "Материал экспедиции 2, карточка 2" },
      { src: "../assets/images/archive/02/1-3.jpg", alt: "Материал экспедиции 2, карточка 3" },
    ],
  },
  {
    id: 3,
    label: "Экспедиция 3",
    shortLabel: "03",
    title: "Экспедиция 3",
    description: "Найдены обложки журналов о событиях, которых нет в хрониках. Даты и заголовки не совпадают с архивами.",
    glow: "../assets/images/archive/03/glow.png",
    images: [
      { src: "../assets/images/archive/03/3-1.jpg", alt: "Материал экспедиции 3, карточка 1" },
      { src: "../assets/images/archive/03/3-2.jpg", alt: "Материал экспедиции 3, карточка 2" },
      { src: "../assets/images/archive/03/3-3.jpg", alt: "Материал экспедиции 3, карточка 3" },
    ],
  },
  {
    id: 4,
    label: "Экспедиция 4",
    shortLabel: "04",
    title: "Экспедиция 4",
    description: "Зафиксированы знаки опасности и предупреждения. Большинство угроз не имеет классификации в базе центра.",
    glow: "../assets/images/archive/04/glow.png",
    images: [
      { src: "../assets/images/archive/04/2-1.jpg", alt: "Материал экспедиции 4, карточка 1" },
      { src: "../assets/images/archive/04/2-2.jpg", alt: "Материал экспедиции 4, карточка 2" },
      { src: "../assets/images/archive/04/2-3.jpg", alt: "Материал экспедиции 4, карточка 3" },
    ],
  },
  {
    id: 5,
    label: "Экспедиция 5",
    shortLabel: "05",
    title: "Экспедиция 5",
    description: "Найдено устройство, фиксирующее звук, движение и изменения пространства. Оно продолжает запись без питания.",
    glow: "../assets/images/archive/05/glow.png",
    images: [
      { src: "../assets/images/archive/05/05.png", alt: "Материал экспедиции 5", variant: "wide" },
    ],
  },
  {
    id: 6,
    label: "Экспедиция 6",
    shortLabel: "06",
    title: "Экспедиция 6",
    description: "Обнаружен журнал пропавшего участника центра. Последние записи описывают маршруты, которых нет на карте.",
    glow: "../assets/images/archive/06/glow.png",
    viewer: "book",
    images: [
      { src: "../assets/images/book/cover.png", alt: "Обложка материалов экспедиции 6" },
    ],
    bookPages: [
      { src: "../assets/images/book/Frame 560.png", alt: "Экспедиция 6, страница 1" },
      { src: "../assets/images/book/Frame 561.png", alt: "Экспедиция 6, страница 2" },
      { src: "../assets/images/book/Frame 562.png", alt: "Экспедиция 6, страница 3" },
      { src: "../assets/images/book/Frame 563.png", alt: "Экспедиция 6, страница 4" },
      { src: "../assets/images/book/Frame 564.png", alt: "Экспедиция 6, страница 5" },
      { src: "../assets/images/book/Frame 565.png", alt: "Экспедиция 6, страница 6" },
      { src: "../assets/images/book/Frame 566.png", alt: "Экспедиция 6, страница 7" },
      { src: "../assets/images/book/Frame 567.png", alt: "Экспедиция 6, страница 8" },
      { src: "../assets/images/book/Frame 568.png", alt: "Экспедиция 6, страница 9" },
      { src: "../assets/images/book/Frame 569.png", alt: "Экспедиция 6, страница 10" },
      { src: "../assets/images/book/Frame 570.png", alt: "Экспедиция 6, страница 11" },
      { src: "../assets/images/book/Frame 571.png", alt: "Экспедиция 6, страница 12" },
      { src: "../assets/images/book/Frame 572.png", alt: "Экспедиция 6, страница 13" },
      { src: "../assets/images/book/Frame 573.png", alt: "Экспедиция 6, страница 14" },
      { src: "../assets/images/book/Frame 574.png", alt: "Экспедиция 6, страница 15" },
      { src: "../assets/images/book/Frame 575.png", alt: "Экспедиция 6, страница 16" },
      { src: "../assets/images/book/Frame 576.png", alt: "Экспедиция 6, страница 17" },
      { src: "../assets/images/book/Frame 577.png", alt: "Экспедиция 6, страница 18" },
      { src: "../assets/images/book/Frame 578.png", alt: "Экспедиция 6, страница 19" },
      { src: "../assets/images/book/Frame 579.png", alt: "Экспедиция 6, страница 20" },
      { src: "../assets/images/book/Frame 580.png", alt: "Экспедиция 6, страница 21" },
      { src: "../assets/images/book/Frame 581.png", alt: "Экспедиция 6, страница 22" },
      { src: "../assets/images/book/Frame 582.png", alt: "Экспедиция 6, страница 23" },
    ],
  },
  {
    id: 7,
    label: "Экспедиция 7",
    shortLabel: "07",
    title: "Экспедиция 7",
    description: "Найдены архивные записи пропавшего исследователя. Передача велась уже после его исчезновения.",
    glow: "../assets/images/archive/07/glow.png",
    viewer: "video",
    video: "../FINAL-azimut.mp4",
    isNew: true,
    images: [
      { src: "../assets/images/archive/07/Frame 539.jpg", alt: "Видео экспедиции 7", variant: "landscape", kind: "video" },
    ],
  },
];

const archiveState = {
  root: null,
  slider: null,
  stage: null,
  svg: null,
  path: null,
  thumb: null,
  labels: null,
  marker: null,
  title: null,
  description: null,
  copy: null,
  content: null,
  glow: null,
  glowLayerIndex: 0,
  activeIndex: -1,
  progress: 0,
  pathLength: 0,
  samples: [],
  isDragging: false,
  pointerId: null,
  wheelLocked: false,
  wheelUnlockTimer: null,
  snapFrame: null,
  swapTimer: null,
  touchStartX: null,
  touchStartY: null,
};

const archiveFullscreenState = {
  root: null,
  dialog: null,
  track: null,
  viewport: null,
  closeButton: null,
  prevButtons: [],
  nextButtons: [],
  slides: [],
  activeIndex: 0,
  lastFocus: null,
  closeTimer: null,
  scrollFrame: null,
  isOpen: false,
  orientationHandler: null,
  mode: "cards",
  bookPages: [],
  bookIndex: 0,
  bookElement: null,
  bookCurrentPage: null,
  bookNextPage: null,
  bookCounter: null,
  bookFlipTimer: null,
  bookPointerStartX: null,
  videoElement: null,
};

function clampArchiveValue(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function getArchiveItemProgress(index) {
  if (expeditions.length <= 1) {
    return 0;
  }

  return 1 - (index / (expeditions.length - 1));
}

function getNearestArchiveIndex(progress) {
  return expeditions.reduce((nearestIndex, _item, index) => {
    const currentDistance = Math.abs(progress - getArchiveItemProgress(index));
    const nearestDistance = Math.abs(progress - getArchiveItemProgress(nearestIndex));
    return currentDistance < nearestDistance ? index : nearestIndex;
  }, 0);
}

function buildArchivePathSamples() {
  const sampleCount = Math.max(120, expeditions.length * 36);

  archiveState.pathLength = archiveState.path.getTotalLength();
  archiveState.samples = Array.from({ length: sampleCount + 1 }, (_item, index) => {
    const progress = index / sampleCount;
    const point = archiveState.path.getPointAtLength(archiveState.pathLength * progress);
    return { progress, x: point.x, y: point.y };
  });
}

function getArchivePoint(progress) {
  const length = archiveState.pathLength * clampArchiveValue(progress);
  return archiveState.path.getPointAtLength(length);
}

function getArchivePointAngle(progress) {
  const length = archiveState.pathLength * clampArchiveValue(progress);
  const delta = Math.max(2, archiveState.pathLength * 0.004);
  const before = archiveState.path.getPointAtLength(clampArchiveValue(length - delta, 0, archiveState.pathLength));
  const after = archiveState.path.getPointAtLength(clampArchiveValue(length + delta, 0, archiveState.pathLength));
  return Math.atan2(after.y - before.y, after.x - before.x) * (180 / Math.PI) - 90;
}

function getStagePoint(point) {
  const viewBox = archiveState.svg.viewBox.baseVal;
  const rect = archiveState.stage.getBoundingClientRect();

  return {
    x: ((point.x - viewBox.x) / viewBox.width) * rect.width,
    y: ((point.y - viewBox.y) / viewBox.height) * rect.height,
  };
}

function positionArchiveLabels() {
  const labels = archiveState.labels.querySelectorAll(".archive-label");

  labels.forEach((label, index) => {
    const progress = getArchiveItemProgress(index);
    const stagePoint = getStagePoint(getArchivePoint(progress));

    label.style.setProperty("--label-x", `${stagePoint.x.toFixed(2)}px`);
    label.style.setProperty("--label-y", `${stagePoint.y.toFixed(2)}px`);
  });

  syncArchiveCopyPosition();
}

function syncArchiveCopyPosition() {
  if (!archiveState.root || !archiveState.copy || !archiveState.labels) {
    return;
  }

  const activeLabel = archiveState.labels.querySelector(".archive-label--active");

  if (!activeLabel) {
    return;
  }

  const rootRect = archiveState.root.getBoundingClientRect();
  const labelRect = activeLabel.getBoundingClientRect();
  const viewportPadding = window.matchMedia("(max-width: 640px)").matches ? 20 : 28;
  const gap = window.matchMedia("(max-width: 640px)").matches ? 10 : 18;
  const copyX = Math.min(
    labelRect.right - rootRect.left + gap,
    rootRect.width - viewportPadding - Math.min(290, Math.max(180, rootRect.width * 0.44))
  );
  const copyY = labelRect.top - rootRect.top + (labelRect.height / 2);

  archiveState.copy.style.setProperty("--archive-copy-x", `${Math.max(viewportPadding, copyX).toFixed(2)}px`);
  archiveState.copy.style.setProperty("--archive-copy-y", `${copyY.toFixed(2)}px`);
}

function renderArchiveItems() {
  archiveState.labels.replaceChildren();

  expeditions.forEach((item, index) => {
    const label = document.createElement("button");
    const isActive = index === archiveState.activeIndex;

    label.className = `archive-label${isActive ? " archive-label--active is-active" : ""}`;
    label.type = "button";
    label.dataset.archiveNumber = String(item.id);
    label.setAttribute("aria-label", item.label);
    label.append(document.createTextNode(isActive ? item.label.toLowerCase() : item.shortLabel));
    if (item.isNew) {
      const newMark = document.createElement("span");
      newMark.className = "archive-label__new";
      newMark.textContent = "new";
      label.append(newMark);
    }
    label.setAttribute("aria-pressed", String(isActive));
    if (isActive) {
      label.setAttribute("aria-current", "true");
    }
    label.addEventListener("pointerdown", (event) => event.stopPropagation());
    label.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveItem(index);
      animateArchiveProgressTo(getArchiveItemProgress(index));
    });

    archiveState.labels.append(label);
  });

  positionArchiveLabels();
}

function renderArchiveGlow(item, immediate = false) {
  if (!archiveState.glow || !item.glow) {
    return;
  }

  if (!archiveState.glow.children.length) {
    const firstLayer = document.createElement("img");
    const secondLayer = document.createElement("img");

    firstLayer.className = "archive-glow__image";
    secondLayer.className = "archive-glow__image";
    firstLayer.alt = "";
    secondLayer.alt = "";
    firstLayer.decoding = "async";
    secondLayer.decoding = "async";
    archiveState.glow.append(firstLayer, secondLayer);
  }

  const layers = Array.from(archiveState.glow.querySelectorAll(".archive-glow__image"));
  const activeLayer = layers[archiveState.glowLayerIndex % layers.length];
  const nextLayer = layers[(archiveState.glowLayerIndex + 1) % layers.length];

  if (activeLayer?.src.endsWith(item.glow)) {
    return;
  }

  nextLayer.src = item.glow;
  nextLayer.classList.add("is-active");
  activeLayer.classList.remove("is-active");

  if (immediate) {
    nextLayer.classList.add("is-active");
    activeLayer.classList.remove("is-active");
  }

  archiveState.glowLayerIndex += 1;
}

function renderArchiveContent(item) {
  const gallery = document.createElement("div");
  const contentItems = Array.isArray(item.images) ? item.images : [];

  gallery.className = `archive-gallery archive-gallery--count-${contentItems.length}`;

  contentItems.forEach((image, index) => {
    const imageData = typeof image === "string" ? { src: image, alt: `${item.title} ${index + 1}` } : image;
    const isVideoCard = item.viewer === "video" || imageData.kind === "video";
    const card = document.createElement("article");
    const inner = document.createElement("div");
    const img = document.createElement("img");

    card.className = `archive-card${imageData.variant ? ` archive-card--${imageData.variant}` : ""}${isVideoCard ? " archive-card--video" : ""}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", isVideoCard ? `Открыть видео ${item.title}` : `Открыть карточку ${item.title} ${index + 1}`);
    inner.className = "archive-card__inner";
    img.className = "archive-card-img";
    img.src = imageData.src;
    img.alt = imageData.alt || `${item.title} ${index + 1}`;
    img.loading = "lazy";

    inner.append(img);
    if (isVideoCard) {
      const playIcon = document.createElement("span");
      playIcon.className = "archive-card__play";
      playIcon.setAttribute("aria-hidden", "true");
      inner.append(playIcon);
    }
    card.append(inner);
    gallery.append(card);
  });

  archiveState.content.replaceChildren(gallery);
  initTiltCards();
}

function setActiveItem(index, options = {}) {
  const nextIndex = clampArchiveValue(index, 0, expeditions.length - 1);
  const item = expeditions[nextIndex];

  if (!item || nextIndex === archiveState.activeIndex) {
    return;
  }

  archiveState.activeIndex = nextIndex;
  if (archiveState.root) {
    archiveState.root.dataset.archiveActive = String(item.id);
  }
  renderArchiveItems();

  const updateTextAndImages = () => {
    renderArchiveGlow(item, options.immediate);
    archiveState.marker.textContent = item.label;
    archiveState.title.textContent = item.title;
    archiveState.description.textContent = item.description;
    renderArchiveContent(item);
  };

  window.clearTimeout(archiveState.swapTimer);

  if (options.immediate) {
    archiveState.copy.classList.remove("is-changing");
    archiveState.content.classList.remove("is-changing");
    updateTextAndImages();
    return;
  }

  archiveState.copy.classList.add("is-changing");
  archiveState.content.classList.add("is-changing");
  archiveState.swapTimer = window.setTimeout(() => {
    updateTextAndImages();
    window.requestAnimationFrame(() => {
      archiveState.copy.classList.remove("is-changing");
      archiveState.content.classList.remove("is-changing");
    });
  }, 130);
}

function updateSliderPosition(progress) {
  archiveState.progress = clampArchiveValue(progress);

  const point = getArchivePoint(archiveState.progress);
  const stagePoint = getStagePoint(point);
  const angle = getArchivePointAngle(archiveState.progress);

  archiveState.thumb.style.setProperty("--thumb-x", `${stagePoint.x.toFixed(2)}px`);
  archiveState.thumb.style.setProperty("--thumb-y", `${stagePoint.y.toFixed(2)}px`);
  archiveState.thumb.style.setProperty("--thumb-angle", `${angle.toFixed(2)}deg`);

  const nearestIndex = getNearestArchiveIndex(archiveState.progress);
  setActiveItem(nearestIndex);
}

function getClosestPointOnPath(clientX, clientY) {
  const matrix = archiveState.svg.getScreenCTM();

  if (!matrix) {
    return { progress: archiveState.progress };
  }

  const svgPoint = archiveState.svg.createSVGPoint();
  svgPoint.x = clientX;
  svgPoint.y = clientY;

  const localPoint = svgPoint.matrixTransform(matrix.inverse());

  return archiveState.samples.reduce((closest, sample) => {
    const distance = Math.hypot(sample.x - localPoint.x, sample.y - localPoint.y);
    return distance < closest.distance ? { progress: sample.progress, distance } : closest;
  }, { progress: archiveState.progress, distance: Number.POSITIVE_INFINITY });
}

function animateArchiveProgressTo(targetProgress) {
  const startProgress = archiveState.progress;
  const endProgress = clampArchiveValue(targetProgress);
  const startTime = performance.now();
  const duration = 360;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.cancelAnimationFrame(archiveState.snapFrame);

  if (reduceMotion) {
    updateSliderPosition(endProgress);
    return;
  }

  const tick = (time) => {
    const elapsed = clampArchiveValue((time - startTime) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const currentProgress = startProgress + (endProgress - startProgress) * eased;

    updateSliderPosition(currentProgress);

    if (elapsed < 1) {
      archiveState.snapFrame = window.requestAnimationFrame(tick);
    } else {
      updateSliderPosition(endProgress);
    }
  };

  archiveState.snapFrame = window.requestAnimationFrame(tick);
}

function goToArchiveIndex(index) {
  const nextIndex = clampArchiveValue(index, 0, expeditions.length - 1);

  if (nextIndex === archiveState.activeIndex) {
    return false;
  }

  setActiveItem(nextIndex);
  animateArchiveProgressTo(getArchiveItemProgress(nextIndex));
  return true;
}

function stepArchiveByWheel(event) {
  const wheelGestureIdleDelay = 90;
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

  if (Math.abs(delta) < 2) {
    return;
  }

  event.preventDefault();
  window.clearTimeout(archiveState.wheelUnlockTimer);

  if (archiveState.wheelLocked || archiveState.isDragging) {
    archiveState.wheelUnlockTimer = window.setTimeout(() => {
      archiveState.wheelLocked = false;
    }, wheelGestureIdleDelay);
    return;
  }

  const direction = delta > 0 ? 1 : -1;
  goToArchiveIndex(archiveState.activeIndex + direction);

  archiveState.wheelLocked = true;
  archiveState.wheelUnlockTimer = window.setTimeout(() => {
    archiveState.wheelLocked = false;
  }, wheelGestureIdleDelay);
}

function snapToNearestItem() {
  const nearestIndex = getNearestArchiveIndex(archiveState.progress);

  setActiveItem(nearestIndex);
  animateArchiveProgressTo(getArchiveItemProgress(nearestIndex));
}

function initTiltCards() {
  const cards = archiveState.content ? archiveState.content.querySelectorAll(".archive-card") : [];

  cards.forEach((card) => {
    if (card.dataset.tiltReady === "true") {
      return;
    }

    card.dataset.tiltReady = "true";

    card.addEventListener("mousemove", (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const rotateX = (-y * 12).toFixed(2);
      const rotateY = (x * 14).toFixed(2);

      card.style.transition = "transform 80ms ease-out";
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(14px) scale(1.025)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transition = "";
      card.style.transform = "";
    });
  });
}

function prefersReducedArchiveMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canUseArchiveDesktopTilt() {
  return !prefersReducedArchiveMotion() && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function resetArchiveFullscreenTilt() {
  const activeCard = archiveFullscreenState.slides[archiveFullscreenState.activeIndex]?.querySelector(".archive-fullscreen__card");

  if (!activeCard) {
    return;
  }

  activeCard.style.setProperty("--tilt-x", "0deg");
  activeCard.style.setProperty("--tilt-y", "0deg");
}

function applyArchiveFullscreenTilt(rotateX, rotateY) {
  const activeCard = archiveFullscreenState.slides[archiveFullscreenState.activeIndex]?.querySelector(".archive-fullscreen__card");

  if (!activeCard || prefersReducedArchiveMotion()) {
    return;
  }

  activeCard.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
  activeCard.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
}

function updateArchiveFullscreenControls() {
  if (archiveFullscreenState.mode === "video") {
    archiveFullscreenState.prevButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-hidden", "true");
    });

    archiveFullscreenState.nextButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-hidden", "true");
    });
    return;
  }

  const isBook = archiveFullscreenState.mode === "book";
  const currentIndex = isBook ? archiveFullscreenState.bookIndex : archiveFullscreenState.activeIndex;
  const maxIndex = isBook ? archiveFullscreenState.bookPages.length - 1 : archiveFullscreenState.slides.length - 1;
  const isFirst = currentIndex <= 0;
  const isLast = currentIndex >= maxIndex;

  archiveFullscreenState.prevButtons.forEach((button) => {
    button.disabled = isFirst;
    button.setAttribute("aria-hidden", String(isFirst));
  });

  archiveFullscreenState.nextButtons.forEach((button) => {
    button.disabled = isLast;
    button.setAttribute("aria-hidden", String(isLast));
  });
}

function setArchiveFullscreenActive(index) {
  const nextIndex = clampArchiveValue(index, 0, Math.max(archiveFullscreenState.slides.length - 1, 0));

  if (nextIndex !== archiveFullscreenState.activeIndex) {
    resetArchiveFullscreenTilt();
  }

  archiveFullscreenState.activeIndex = nextIndex;
  archiveFullscreenState.slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === nextIndex;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", String(!isActive));
  });
  updateArchiveFullscreenControls();
}

function scrollArchiveFullscreenTo(index, behavior = "smooth") {
  const slide = archiveFullscreenState.slides[index];
  const track = archiveFullscreenState.track;

  if (!slide || !track) {
    return;
  }

  const targetLeft = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
  const resolvedBehavior = prefersReducedArchiveMotion() ? "auto" : behavior;

  setArchiveFullscreenActive(index);
  track.scrollTo({ left: targetLeft, behavior: resolvedBehavior });
}

function syncArchiveFullscreenIndexFromScroll() {
  const track = archiveFullscreenState.track;

  if (!track || !archiveFullscreenState.slides.length) {
    return;
  }

  const trackCenter = track.getBoundingClientRect().left + track.clientWidth / 2;
  const nearestIndex = archiveFullscreenState.slides.reduce((nearest, slide, index) => {
    const rect = slide.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
    return distance < nearest.distance ? { index, distance } : nearest;
  }, { index: archiveFullscreenState.activeIndex, distance: Number.POSITIVE_INFINITY }).index;

  setArchiveFullscreenActive(nearestIndex);
}

function queueArchiveFullscreenScrollSync() {
  if (archiveFullscreenState.scrollFrame) {
    return;
  }

  archiveFullscreenState.scrollFrame = window.requestAnimationFrame(() => {
    archiveFullscreenState.scrollFrame = null;
    syncArchiveFullscreenIndexFromScroll();
  });
}

function goArchiveFullscreen(delta) {
  if (archiveFullscreenState.mode === "book") {
    goArchiveBookPage(delta);
    return;
  }

  if (archiveFullscreenState.mode === "video") {
    return;
  }

  scrollArchiveFullscreenTo(archiveFullscreenState.activeIndex + delta);
}

function disableArchiveOrientationTilt() {
  if (!archiveFullscreenState.orientationHandler) {
    return;
  }

  window.removeEventListener("deviceorientation", archiveFullscreenState.orientationHandler);
  archiveFullscreenState.orientationHandler = null;
}

function enableArchiveOrientationTilt() {
  const isMobileLike = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  if (!isMobileLike || prefersReducedArchiveMotion() || typeof DeviceOrientationEvent === "undefined") {
    return;
  }

  const startListening = () => {
    disableArchiveOrientationTilt();
    archiveFullscreenState.orientationHandler = (event) => {
      if (!archiveFullscreenState.isOpen || event.beta === null || event.gamma === null) {
        return;
      }

      const rotateX = -clampArchiveValue(event.beta, -18, 18) / 18 * 4;
      const rotateY = clampArchiveValue(event.gamma, -18, 18) / 18 * 5;
      applyArchiveFullscreenTilt(rotateX, rotateY);
    };
    window.addEventListener("deviceorientation", archiveFullscreenState.orientationHandler);
  };

  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") {
          startListening();
        }
      })
      .catch(() => {});
    return;
  }

  startListening();
}

function renderArchiveFullscreenCards(cards, activeIndex) {
  archiveFullscreenState.mode = "cards";
  archiveFullscreenState.root.classList.remove("archive-fullscreen--book", "archive-fullscreen--video");
  archiveFullscreenState.track.replaceChildren();
  archiveFullscreenState.bookPages = [];
  archiveFullscreenState.bookIndex = 0;
  archiveFullscreenState.bookElement = null;
  archiveFullscreenState.bookCurrentPage = null;
  archiveFullscreenState.bookNextPage = null;
  archiveFullscreenState.bookCounter = null;
  archiveFullscreenState.videoElement = null;
  archiveFullscreenState.slides = cards.map((card, index) => {
    const slide = document.createElement("div");
    const clone = card.cloneNode(true);

    slide.className = "archive-fullscreen__slide";
    clone.classList.add("archive-fullscreen__card");
    clone.removeAttribute("style");
    clone.removeAttribute("tabindex");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-label");
    clone.removeAttribute("data-tilt-ready");
    clone.querySelectorAll("[data-tilt-ready]").forEach((node) => node.removeAttribute("data-tilt-ready"));
    slide.append(clone);
    archiveFullscreenState.track.append(slide);

    return slide;
  });

  setArchiveFullscreenActive(activeIndex);
}

function renderArchiveVideoFullscreen(item) {
  const player = document.createElement("div");
  const video = document.createElement("video");
  const source = document.createElement("source");

  archiveFullscreenState.mode = "video";
  archiveFullscreenState.root.classList.remove("archive-fullscreen--book");
  archiveFullscreenState.root.classList.add("archive-fullscreen--video");
  archiveFullscreenState.track.replaceChildren();
  archiveFullscreenState.slides = [];
  archiveFullscreenState.bookPages = [];
  archiveFullscreenState.bookIndex = 0;
  archiveFullscreenState.bookElement = null;
  archiveFullscreenState.bookCurrentPage = null;
  archiveFullscreenState.bookNextPage = null;
  archiveFullscreenState.bookCounter = null;

  player.className = "archive-video-player";
  video.className = "archive-video-player__media";
  video.controls = true;
  video.autoplay = true;
  video.muted = false;
  video.volume = 1;
  video.playsInline = true;
  video.preload = "metadata";
  source.src = item.video;
  source.type = "video/mp4";

  video.append(source);
  player.append(video);
  archiveFullscreenState.track.append(player);
  archiveFullscreenState.videoElement = video;
  updateArchiveFullscreenControls();

  window.__ap4SiteAudio?.duck?.();
  video.load();
  video.play().catch(() => {});
}

function createArchiveBookPage(page, pageIndex, className) {
  const pageElement = document.createElement("div");
  const img = document.createElement("img");

  pageElement.className = className;
  img.src = page.src;
  img.alt = page.alt || `Страница ${pageIndex + 1}`;
  img.draggable = false;
  img.style.objectPosition = page.position || "center";
  pageElement.append(img);

  return pageElement;
}

function paintArchiveBookPage() {
  const page = archiveFullscreenState.bookPages[archiveFullscreenState.bookIndex];

  if (!page || !archiveFullscreenState.bookCurrentPage || !archiveFullscreenState.bookCounter) {
    return;
  }

  archiveFullscreenState.bookCurrentPage.replaceChildren(
    createArchiveBookPage(page, archiveFullscreenState.bookIndex, "archive-book__page-face").firstElementChild
  );
  archiveFullscreenState.bookCounter.textContent = `${archiveFullscreenState.bookIndex + 1} / ${archiveFullscreenState.bookPages.length}`;
  updateArchiveFullscreenControls();
}

function goArchiveBookPage(delta) {
  const nextIndex = clampArchiveValue(archiveFullscreenState.bookIndex + delta, 0, archiveFullscreenState.bookPages.length - 1);

  if (
    nextIndex === archiveFullscreenState.bookIndex ||
    !archiveFullscreenState.bookElement ||
    archiveFullscreenState.bookElement.classList.contains("is-flipping")
  ) {
    return;
  }

  const directionClass = delta > 0 ? "is-flipping-next" : "is-flipping-prev";
  const nextPage = archiveFullscreenState.bookPages[nextIndex];

  window.clearTimeout(archiveFullscreenState.bookFlipTimer);
  archiveFullscreenState.bookNextPage.replaceChildren(
    createArchiveBookPage(nextPage, nextIndex, "archive-book__page-face").firstElementChild
  );
  archiveFullscreenState.bookElement.classList.add("is-flipping", directionClass);

  archiveFullscreenState.bookFlipTimer = window.setTimeout(() => {
    archiveFullscreenState.bookIndex = nextIndex;
    archiveFullscreenState.bookElement.classList.add("is-resetting");
    paintArchiveBookPage();
    archiveFullscreenState.bookElement.classList.remove("is-flipping", directionClass);
    archiveFullscreenState.bookElement.offsetHeight;
    archiveFullscreenState.bookElement.classList.remove("is-resetting");
  }, prefersReducedArchiveMotion() ? 0 : 520);
}

function renderArchiveBookFullscreen(item) {
  const pages = Array.isArray(item.bookPages) && item.bookPages.length ? item.bookPages : item.images;
  const book = document.createElement("div");
  const shadow = document.createElement("div");
  const currentPage = document.createElement("div");
  const nextPage = document.createElement("div");
  const spine = document.createElement("div");
  const counter = document.createElement("div");

  archiveFullscreenState.mode = "book";
  archiveFullscreenState.root.classList.remove("archive-fullscreen--video");
  archiveFullscreenState.root.classList.add("archive-fullscreen--book");
  archiveFullscreenState.track.replaceChildren();
  archiveFullscreenState.slides = [];
  archiveFullscreenState.bookPages = pages.map((page, index) => (
    typeof page === "string" ? { src: page, alt: `${item.title}, страница ${index + 1}` } : page
  ));
  archiveFullscreenState.bookIndex = 0;
  archiveFullscreenState.videoElement = null;

  book.className = "archive-book";
  shadow.className = "archive-book__shadow";
  currentPage.className = "archive-book__page archive-book__page--current";
  nextPage.className = "archive-book__page archive-book__page--next";
  spine.className = "archive-book__spine";
  counter.className = "archive-book__counter";

  book.append(shadow, nextPage, currentPage, spine, counter);
  archiveFullscreenState.track.append(book);
  archiveFullscreenState.bookElement = book;
  archiveFullscreenState.bookCurrentPage = currentPage;
  archiveFullscreenState.bookNextPage = nextPage;
  archiveFullscreenState.bookCounter = counter;
  paintArchiveBookPage();
}

function openArchiveFullscreen(index) {
  const cards = Array.from(archiveState.content?.querySelectorAll(".archive-card") || []);
  const activeItem = expeditions[archiveState.activeIndex];

  if (!archiveFullscreenState.root || !cards.length) {
    return;
  }

  window.clearTimeout(archiveFullscreenState.closeTimer);
  archiveFullscreenState.lastFocus = document.activeElement;
  archiveFullscreenState.isOpen = true;
  archiveFullscreenState.root.hidden = false;
  document.body.classList.add("is-card-open");

  if (activeItem?.viewer === "book") {
    renderArchiveBookFullscreen(activeItem);
  } else if (activeItem?.viewer === "video") {
    renderArchiveVideoFullscreen(activeItem);
  } else {
    renderArchiveFullscreenCards(cards, clampArchiveValue(index, 0, cards.length - 1));
  }

  window.requestAnimationFrame(() => {
    archiveFullscreenState.root.classList.add("is-open");
    if (archiveFullscreenState.mode === "cards") {
      scrollArchiveFullscreenTo(archiveFullscreenState.activeIndex, "auto");
    }
    archiveFullscreenState.dialog.focus({ preventScroll: true });
    enableArchiveOrientationTilt();
  });
}

function closeArchiveFullscreen() {
  if (!archiveFullscreenState.root || !archiveFullscreenState.isOpen) {
    return;
  }

  archiveFullscreenState.isOpen = false;
  archiveFullscreenState.root.classList.remove("is-open");
  document.body.classList.remove("is-card-open");
  disableArchiveOrientationTilt();
  resetArchiveFullscreenTilt();
  archiveFullscreenState.videoElement?.pause();
  window.__ap4SiteAudio?.restore?.();

  archiveFullscreenState.closeTimer = window.setTimeout(() => {
    archiveFullscreenState.root.hidden = true;
    archiveFullscreenState.track.replaceChildren();
    archiveFullscreenState.slides = [];
    archiveFullscreenState.mode = "cards";
    archiveFullscreenState.bookPages = [];
    archiveFullscreenState.bookIndex = 0;
    archiveFullscreenState.bookElement = null;
    archiveFullscreenState.bookCurrentPage = null;
    archiveFullscreenState.bookNextPage = null;
    archiveFullscreenState.bookCounter = null;
    archiveFullscreenState.bookPointerStartX = null;
    archiveFullscreenState.videoElement = null;
    archiveFullscreenState.root.classList.remove("archive-fullscreen--book", "archive-fullscreen--video");

    if (archiveFullscreenState.lastFocus?.isConnected) {
      archiveFullscreenState.lastFocus.focus({ preventScroll: true });
    }
  }, prefersReducedArchiveMotion() ? 0 : 260);
}

function handleArchiveFullscreenPointerMove(event) {
  if (archiveFullscreenState.mode !== "cards") {
    return;
  }

  if (!canUseArchiveDesktopTilt()) {
    return;
  }

  const activeCard = archiveFullscreenState.slides[archiveFullscreenState.activeIndex]?.querySelector(".archive-fullscreen__card");

  if (!activeCard || !activeCard.contains(event.target)) {
    return;
  }

  const rect = activeCard.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;

  applyArchiveFullscreenTilt(-y * 7, x * 8);
}

function handleArchiveBookPointerDown(event) {
  if (archiveFullscreenState.mode !== "book") {
    return;
  }

  archiveFullscreenState.bookPointerStartX = event.clientX;
}

function handleArchiveBookPointerUp(event) {
  if (archiveFullscreenState.mode !== "book" || archiveFullscreenState.bookPointerStartX === null) {
    return;
  }

  const deltaX = event.clientX - archiveFullscreenState.bookPointerStartX;
  archiveFullscreenState.bookPointerStartX = null;

  if (Math.abs(deltaX) < 42) {
    return;
  }

  goArchiveBookPage(deltaX < 0 ? 1 : -1);
}

function initArchiveFullscreen() {
  archiveFullscreenState.root = document.querySelector("[data-archive-fullscreen]");

  if (!archiveFullscreenState.root) {
    return;
  }

  archiveFullscreenState.dialog = archiveFullscreenState.root.querySelector(".archive-fullscreen__dialog");
  archiveFullscreenState.track = archiveFullscreenState.root.querySelector("[data-archive-fullscreen-track]");
  archiveFullscreenState.viewport = archiveFullscreenState.root.querySelector("[data-archive-fullscreen-viewport]");
  archiveFullscreenState.closeButton = archiveFullscreenState.root.querySelector("[data-archive-fullscreen-close]");
  archiveFullscreenState.prevButtons = Array.from(archiveFullscreenState.root.querySelectorAll("[data-archive-fullscreen-prev]"));
  archiveFullscreenState.nextButtons = Array.from(archiveFullscreenState.root.querySelectorAll("[data-archive-fullscreen-next]"));

  if (!archiveFullscreenState.dialog || !archiveFullscreenState.track || !archiveFullscreenState.closeButton) {
    return;
  }

  archiveFullscreenState.closeButton.addEventListener("click", closeArchiveFullscreen);
  archiveFullscreenState.prevButtons.forEach((button) => {
    button.addEventListener("click", () => goArchiveFullscreen(-1));
  });
  archiveFullscreenState.nextButtons.forEach((button) => {
    button.addEventListener("click", () => goArchiveFullscreen(1));
  });

  archiveFullscreenState.track.addEventListener("scroll", queueArchiveFullscreenScrollSync, { passive: true });
  archiveFullscreenState.track.addEventListener("pointerdown", handleArchiveBookPointerDown);
  archiveFullscreenState.track.addEventListener("pointerup", handleArchiveBookPointerUp);
  archiveFullscreenState.track.addEventListener("pointercancel", () => {
    archiveFullscreenState.bookPointerStartX = null;
  });
  archiveFullscreenState.track.addEventListener("pointermove", handleArchiveFullscreenPointerMove);
  archiveFullscreenState.track.addEventListener("pointerleave", resetArchiveFullscreenTilt);

  document.addEventListener("keydown", (event) => {
    if (!archiveFullscreenState.isOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeArchiveFullscreen();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goArchiveFullscreen(1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goArchiveFullscreen(-1);
    }
  });
}

function initArchiveSlider() {
  archiveState.root = document.querySelector("[data-archive]");

  if (!archiveState.root) {
    return;
  }

  archiveState.slider = archiveState.root.querySelector("[data-archive-slider]");
  archiveState.stage = archiveState.root.querySelector(".archive-slider__stage");
  archiveState.svg = archiveState.root.querySelector(".archive-curve");
  archiveState.path = archiveState.root.querySelector("[data-archive-path]");
  archiveState.thumb = archiveState.root.querySelector("[data-archive-thumb]");
  archiveState.labels = archiveState.root.querySelector("[data-archive-labels]");
  archiveState.marker = archiveState.root.querySelector("[data-archive-marker]");
  archiveState.title = archiveState.root.querySelector("[data-archive-title]");
  archiveState.description = archiveState.root.querySelector("[data-archive-description]");
  archiveState.copy = archiveState.root.querySelector("[data-archive-copy]");
  archiveState.content = archiveState.root.querySelector("[data-archive-content]");
  archiveState.glow = archiveState.root.querySelector("[data-archive-glow]");

  if (!archiveState.slider || !archiveState.path || !archiveState.thumb || !archiveState.labels || !archiveState.content) {
    return;
  }

  buildArchivePathSamples();
  const initialIndex = 0;
  setActiveItem(initialIndex, { immediate: true });
  updateSliderPosition(getArchiveItemProgress(initialIndex));
  initArchiveFullscreen();

  archiveState.content.addEventListener("click", (event) => {
    const card = event.target.closest(".archive-card");

    if (!card || !archiveState.content.contains(card)) {
      return;
    }

    event.preventDefault();
    const cards = Array.from(archiveState.content.querySelectorAll(".archive-card"));
    openArchiveFullscreen(cards.indexOf(card));
  });

  archiveState.content.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const card = event.target.closest(".archive-card");

    if (!card || !archiveState.content.contains(card)) {
      return;
    }

    event.preventDefault();
    const cards = Array.from(archiveState.content.querySelectorAll(".archive-card"));
    openArchiveFullscreen(cards.indexOf(card));
  });

  archiveState.root.addEventListener("pointerdown", (event) => {
    if (
      window.matchMedia("(max-width: 900px)").matches ||
      event.pointerType !== "touch" ||
      event.target.closest(".archive-slider, .archive-card, button, a")
    ) {
      return;
    }

    archiveState.touchStartX = event.clientX;
    archiveState.touchStartY = event.clientY;
  }, { passive: true });

  archiveState.root.addEventListener("pointerup", (event) => {
    if (archiveState.touchStartX === null || archiveState.touchStartY === null) {
      return;
    }

    const deltaX = event.clientX - archiveState.touchStartX;
    const deltaY = event.clientY - archiveState.touchStartY;

    archiveState.touchStartX = null;
    archiveState.touchStartY = null;

    if (Math.abs(deltaY) < 36 || Math.abs(deltaY) < Math.abs(deltaX) * 1.15) {
      return;
    }

    goToArchiveIndex(archiveState.activeIndex + (deltaY < 0 ? 1 : -1));
  });

  archiveState.slider.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    event.preventDefault();
    window.cancelAnimationFrame(archiveState.snapFrame);
    archiveState.isDragging = true;
    archiveState.pointerId = event.pointerId;
    archiveState.slider.setPointerCapture(event.pointerId);
    updateSliderPosition(getClosestPointOnPath(event.clientX, event.clientY).progress);
  });

  archiveState.slider.addEventListener("pointermove", (event) => {
    if (!archiveState.isDragging || event.pointerId !== archiveState.pointerId) {
      return;
    }

    event.preventDefault();
    updateSliderPosition(getClosestPointOnPath(event.clientX, event.clientY).progress);
  });

  const finishPointer = (event) => {
    if (!archiveState.isDragging || event.pointerId !== archiveState.pointerId) {
      return;
    }

    archiveState.isDragging = false;
    archiveState.pointerId = null;

    if (archiveState.slider.hasPointerCapture(event.pointerId)) {
      archiveState.slider.releasePointerCapture(event.pointerId);
    }

    snapToNearestItem();
  };

  archiveState.slider.addEventListener("pointerup", finishPointer);
  archiveState.slider.addEventListener("pointercancel", finishPointer);

  archiveState.slider.addEventListener("wheel", stepArchiveByWheel, { passive: false });

  archiveState.thumb.addEventListener("keydown", (event) => {
    const nextIndex = archiveState.activeIndex + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0);

    if (event.key === "Home") {
      event.preventDefault();
      setActiveItem(0);
      animateArchiveProgressTo(getArchiveItemProgress(0));
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setActiveItem(expeditions.length - 1);
      animateArchiveProgressTo(getArchiveItemProgress(expeditions.length - 1));
      return;
    }

    if (nextIndex !== archiveState.activeIndex) {
      event.preventDefault();
      goToArchiveIndex(nextIndex);
    }
  });

  window.addEventListener("resize", () => {
    buildArchivePathSamples();
    positionArchiveLabels();
    updateSliderPosition(archiveState.progress);
    syncArchiveCopyPosition();
  });
}

initArchiveSlider();
