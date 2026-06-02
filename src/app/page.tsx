'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import Image from 'next/image';

interface MovieOption {
  id: number;
  title: string;
  poster_path: string;
}

interface Movie extends MovieOption {
  backdrop_paths: string[];
  cast: Actor[];
  overview: string;
  release_date: string;
  recommendations: MovieOption[];
  trailer_url: string | null;
}

interface Actor {
  id: number;
  name: string;
  profile_path: string;
}

interface MovieResponse {
  total_pages: number;
  results: {
    id: number;
    title: string;
    poster_path: string;
  }[];
}

interface MovieDetailsResponse {
  images: {
    backdrops: {
      iso_639_1: string | null;
      file_path: string;
    }[];
  };
  overview: string;
  release_date: string;
  credits: {
    cast: {
      id: number;
      name: string;
      profile_path: string | null;
    }[];
  };
  recommendations: {
    results: MovieOption[];
  };
  videos: {
    results: {
      id: string;
      key: string;
      name: string;
      official: boolean;
      site: string;
      type: string;
    }[];
  };
}

const API_KEY = process.env.NEXT_PUBLIC_API_KEY;
const MAX_HINT_STEP = 2;
const RECENT_MOVIES_KEY = 'tmdb-quiz-recent-movies';
const THEME_STORAGE_KEY = 'tmdb-quiz-theme';
const RECENT_MOVIES_LIMIT = 40;
const DISCOVER_PAGE_LIMIT = 25;
const DISCOVER_ATTEMPTS = 5;
const INTRO_POSTERS = [
  '/posters/poster-01.webp',
  '/posters/poster-02.webp',
  '/posters/poster-03.webp',
  '/posters/poster-04.webp',
  '/posters/poster-05.webp',
  '/posters/poster-06.webp',
  '/posters/poster-07.webp',
  '/posters/poster-08.webp',
  '/posters/poster-09.webp',
  '/posters/poster-10.webp',
  '/posters/poster-11.webp',
  '/posters/poster-12.webp',
  '/posters/poster-13.webp',
  '/posters/poster-14.webp',
  '/posters/poster-15.webp',
  '/posters/poster-16.webp',
];

const getRecentMovieIds = (): number[] => {
  if (typeof window === 'undefined') return [];

  try {
    const value = window.localStorage.getItem(RECENT_MOVIES_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
};

const rememberMovieId = (movieId: number) => {
  if (typeof window === 'undefined') return;

  const recentIds = getRecentMovieIds().filter((id) => id !== movieId);
  window.localStorage.setItem(
    RECENT_MOVIES_KEY,
    JSON.stringify([movieId, ...recentIds].slice(0, RECENT_MOVIES_LIMIT))
  );
};

const fetchRandomMovie = async (): Promise<Movie | null> => {
  try {
    for (let attempt = 0; attempt < DISCOVER_ATTEMPTS; attempt += 1) {
      const randomYear = Math.floor(Math.random() * (2026 - 1980 + 1)) + 1980; // Случайный год в диапазоне 1980-2026
      const firstPageResponse = await axios.get<MovieResponse>('https://api.themoviedb.org/3/discover/movie', {
        params: {
          api_key: API_KEY,
          language: 'en-US',
          sort_by: 'popularity.desc',
          year: randomYear,
          page: 1,
        },
      });

      const pageLimit = Math.max(1, Math.min(firstPageResponse.data.total_pages, DISCOVER_PAGE_LIMIT));
      const randomPage = Math.floor(Math.random() * pageLimit) + 1;
      const response = randomPage === 1
        ? firstPageResponse
        : await axios.get<MovieResponse>('https://api.themoviedb.org/3/discover/movie', {
          params: {
            api_key: API_KEY,
            language: 'en-US',
            sort_by: 'popularity.desc',
            year: randomYear,
            page: randomPage,
          },
        });

      const recentMovieIds = new Set(getRecentMovieIds());
      const movies = response.data.results.filter((movie) => !recentMovieIds.has(movie.id));
      if (movies.length === 0) continue;

      const shuffledMovies = shuffleArray(movies);

      for (const selectedMovie of shuffledMovies) {
        const details = await fetchMovieDetails(selectedMovie.id);

        if (details.backdrop_paths.length < 3 || details.cast.length < 3) {
          continue;
        }

        return {
          id: selectedMovie.id,
          title: selectedMovie.title,
          poster_path: selectedMovie.poster_path,
          backdrop_paths: details.backdrop_paths,
          cast: details.cast,
          overview: details.overview,
          release_date: details.release_date,
          recommendations: details.recommendations,
          trailer_url: details.trailer_url,
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching movie:', error);
    return null;
  }
};

const fetchMovieDetails = async (movieId: number): Promise<Omit<Movie, 'id' | 'title' | 'poster_path'>> => {
  try {
    const response = await axios.get<MovieDetailsResponse>(`https://api.themoviedb.org/3/movie/${movieId}`, {
      params: {
        api_key: API_KEY,
        append_to_response: 'images,credits,recommendations,videos',
        include_image_language: 'en,null',
      },
    });

    const backdrops = response.data.images.backdrops
      .filter((backdrop) => backdrop.iso_639_1 === null)
      .slice(0, 3)
      .map((backdrop) => `https://image.tmdb.org/t/p/w780${backdrop.file_path}`);

    const cast = response.data.credits.cast
      .filter((actor) => actor.profile_path)
      .slice(0, 3)
      .map((actor) => ({
        id: actor.id,
        name: actor.name,
        profile_path: `https://image.tmdb.org/t/p/w185${actor.profile_path}`,
      }));

    const trailer = response.data.videos.results.find((video) => (
      video.site === 'YouTube' &&
      video.type === 'Trailer' &&
      video.official
    )) ?? response.data.videos.results.find((video) => (
      video.site === 'YouTube' &&
      video.type === 'Trailer'
    ));

    return {
      backdrop_paths: backdrops,
      cast,
      overview: response.data.overview,
      release_date: response.data.release_date,
      recommendations: response.data.recommendations.results,
      trailer_url: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
    };
  } catch (error) {
    console.error('Error fetching movie details:', error);
    return {
      backdrop_paths: [],
      cast: [],
      overview: '',
      release_date: '',
      recommendations: [],
      trailer_url: null,
    };
  }
};

const shuffleArray = <T,>(array: T[]): T[] => {
  return [...array].sort(() => Math.random() - 0.5);
};

export default function Quiz() {
  const [currentMovie, setCurrentMovie] = useState<Movie | null>(null);
  const [options, setOptions] = useState<MovieOption[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showTrailerModal, setShowTrailerModal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hintStep, setHintStep] = useState<number>(0);
  const [pendingHintStep, setPendingHintStep] = useState<number | null>(null);
  const [isHintClosing, setIsHintClosing] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isNightTheme, setIsNightTheme] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;

    try {
      return window.localStorage.getItem(THEME_STORAGE_KEY) !== 'light';
    } catch {
      return true;
    }
  });
  const resultModalRef = useRef<HTMLDivElement | null>(null);
  const resultDetailsRef = useRef<HTMLDivElement | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const countdownTokenRef = useRef<number>(0);


  const generateQuestion = useCallback(async () => {
    setError(null);

    const movie = await fetchRandomMovie();
    if (!movie) {
      setError('No movie found for the selected year.');
      setLoading(false);
      return;
    }

    const recommendationOptions = shuffleArray(movie.recommendations)
      .filter((option) => option.id !== movie.id)
      .filter((option, index, array) => array.findIndex((item) => item.id === option.id) === index)
      .slice(0, 3);

    const randomOptions: MovieOption[] = [movie, ...recommendationOptions];
    let optionAttempts = 0;

    while (randomOptions.length < 4 && optionAttempts < 8) {
      optionAttempts += 1;
      const randomOption = await fetchRandomMovie();
      if (randomOption && !randomOptions.find((opt) => opt.id === randomOption.id)) {
        randomOptions.push(randomOption);
      }
    }

    if (randomOptions.length < 4) {
      setError('Could not load enough movie options. Try again.');
      setLoading(false);
      return;
    }

    setCurrentMovie(movie);
    rememberMovieId(movie.id);
    setOptions(shuffleArray(randomOptions));
    setLoading(false);
    setMessage('');
    setRewardMessage(null);
    setShowModal(false);
    setShowTrailerModal(false);
    setHintStep(0);
    setPendingHintStep(null);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, isNightTheme ? 'night' : 'light');
    } catch {
      // Theme persistence is optional.
    }
  }, [isNightTheme]);

  const clearCountdownTimer = useCallback(() => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  useEffect(() => clearCountdownTimer, [clearCountdownTimer]);

  const startRoundWithCountdown = useCallback(() => {
    clearCountdownTimer();

    countdownTokenRef.current += 1;
    const countdownToken = countdownTokenRef.current;
    let nextCountdown = 3;

    setCountdown(nextCountdown);
    setLoading(true);
    void generateQuestion();

    countdownIntervalRef.current = window.setInterval(() => {
      if (countdownToken !== countdownTokenRef.current) {
        clearCountdownTimer();
        return;
      }

      nextCountdown -= 1;

      if (nextCountdown > 0) {
        setCountdown(nextCountdown);
        return;
      }

      clearCountdownTimer();
      setCountdown(null);
    }, 1000);
  }, [clearCountdownTimer, generateQuestion]);

  const handleStartGame = () => {
    setHasStarted(true);
    startRoundWithCountdown();
  };

  const handleHomeClick = () => {
    countdownTokenRef.current += 1;
    clearCountdownTimer();
    setHasStarted(false);
    setLoading(false);
    setCountdown(null);
    setShowModal(false);
    setShowTrailerModal(false);
    setPendingHintStep(null);
    setIsHintClosing(false);
    setMessage('');
    setRewardMessage(null);
    setError(null);
  };

  const handleAnswerClick = (selectedMovie: MovieOption) => {
    if (!currentMovie) return;

    if (selectedMovie.id === currentMovie.id) {
      setMessage('Correct!');
      setShowModal(true);
    } else {
      const nextHintStep = hintStep + 1;
      const hasAnotherChance = hintStep < MAX_HINT_STEP && (
        currentMovie.backdrop_paths.length > nextHintStep ||
        currentMovie.cast.length > nextHintStep
      );

      if (hasAnotherChance) {
        setPendingHintStep(nextHintStep);
        setMessage('Not quite. Try once more with a new hint.');
        return;
      }

      setMessage(`Incorrect! The movie was: ${currentMovie?.title}`);
      setShowModal(true);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    setShowTrailerModal(false);
    startRoundWithCountdown();
  };

  const handleHintModalClose = () => {
    setIsHintClosing(true);

    window.setTimeout(() => {
      if (pendingHintStep !== null) {
        setHintStep(pendingHintStep);
      }

      setPendingHintStep(null);
      setIsHintClosing(false);
      setMessage('');
    }, 220);
  };

  const handleDescriptionToggle = (event: React.ToggleEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open || !resultModalRef.current || !resultDetailsRef.current) return;

    window.setTimeout(() => {
      const modal = resultModalRef.current;
      const details = resultDetailsRef.current;
      if (!modal || !details) return;

      modal.scrollTo({
        top: Math.max(details.offsetTop - 16, 0),
        behavior: 'smooth',
      });
    }, 80);
  };

  const visibleBackdrop = currentMovie?.backdrop_paths[Math.min(hintStep, currentMovie.backdrop_paths.length - 1)];
  const visibleActor = currentMovie?.cast[Math.min(hintStep, currentMovie.cast.length - 1)];
  const releaseYear = currentMovie?.release_date ? new Date(currentMovie.release_date).getFullYear() : null;
  const isCorrectAnswer = message.includes('Correct');
  const trailerEmbedUrl = currentMovie?.trailer_url?.replace('watch?v=', 'embed/');
  const themeToggleLabel = isNightTheme ? 'Switch to light theme' : 'Switch to night theme';
  const themeToggleIcon = isNightTheme ? (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  ) : (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.99 13.34A8 8 0 1 1 10.66 3.01 6.5 6.5 0 0 0 20.99 13.34Z" />
    </svg>
  );
  const themeToggleButton = (
    <button
      onClick={() => setIsNightTheme((theme) => !theme)}
      aria-label={themeToggleLabel}
      title={themeToggleLabel}
      className={`${isNightTheme ? 'bg-white/10 text-white hover:bg-white/15 focus:ring-amber-200/30' : 'bg-slate-950/10 text-slate-950 hover:bg-slate-950/15 focus:ring-slate-950/20'} flex h-11 w-11 shrink-0 items-center justify-center rounded-full backdrop-blur transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-4`}
    >
      {themeToggleIcon}
    </button>
  );

  if (!hasStarted) {
    return (
      <main className={`${isNightTheme ? 'bg-[#11100f] text-white' : 'bg-slate-100 text-slate-950'} relative min-h-screen overflow-hidden`}>
        <div className={`${isNightTheme ? 'bg-[#11100f]' : 'bg-[radial-gradient(circle_at_26%_38%,#ffffff_0%,#f1f5f9_48%,#dbe3ee_100%)]'} absolute inset-0`} />
        <div className="intro-poster-wall absolute -inset-x-12 -inset-y-16 grid grid-cols-4 gap-3 opacity-55 blur-[1px] sm:-inset-x-20 sm:-inset-y-24 sm:grid-cols-6 sm:gap-4 lg:hidden">
          {INTRO_POSTERS.map((src, index) => (
            <div
              key={`${src}-${index}`}
              className="intro-poster-tile relative aspect-[2/3] overflow-hidden rounded-[5px] bg-white/5 shadow-[0_22px_55px_rgba(0,0,0,0.5)]"
              style={{
                '--poster-y': index % 2 === 0 ? '22px' : '-12px',
                '--poster-r': index % 3 === 0 ? '-2deg' : '1deg',
                '--poster-drift': `${index % 4 === 0 ? -38 : 30}px`,
                '--poster-delay': `${index * -240}ms`,
              } as React.CSSProperties}
            >
              <Image
                src={src}
                alt=""
                fill
                priority={index < 8}
                className="intro-poster-image object-cover"
                sizes="(max-width: 640px) 28vw, (max-width: 1024px) 18vw, 150px"
              />
            </div>
          ))}
        </div>
        <div className="intro-feature-posters absolute inset-0 hidden lg:block">
          {INTRO_POSTERS.slice(0, 6).map((src, index) => (
            <div key={src} className={`intro-feature-poster intro-feature-poster-${index + 1}`}>
              <Image
                src={src}
                alt=""
                fill
                priority={index < 3}
                className="object-cover"
                sizes="360px"
              />
            </div>
          ))}
        </div>
        <div className={`${isNightTheme ? 'intro-home-shade' : 'intro-home-shade-light'} absolute inset-0`} />
        <div className={`${isNightTheme ? 'bg-[radial-gradient(circle_at_28%_48%,rgba(255,255,255,0.1)_0%,rgba(17,16,15,0.3)_34%,rgba(17,16,15,0.92)_78%)]' : 'bg-[radial-gradient(circle_at_28%_48%,rgba(255,255,255,0.08)_0%,rgba(248,250,252,0.07)_42%,rgba(226,232,240,0.04)_88%)]'} absolute inset-0`} />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-between px-5 py-7 sm:px-8 sm:py-10">
          <div className="absolute right-5 top-7 z-20 sm:right-8 sm:top-10">
            {themeToggleButton}
          </div>
          <header className="intro-fade-down flex items-center justify-center gap-3 sm:justify-start">
            <span className="text-2xl font-black tracking-tight sm:text-3xl">Guess</span>
            <Image src="/logo.png" alt="Logo" width={68} height={68} className="h-14 w-14 drop-shadow-2xl sm:h-16 sm:w-16" priority />
            <span className="text-2xl font-black tracking-tight sm:text-3xl">Movie</span>
          </header>

          <section className="flex flex-1 flex-col items-center justify-center pb-16 pt-10 text-center sm:items-start sm:pb-20 sm:text-left">
            <p className={`${isNightTheme ? 'text-amber-200/90' : 'text-amber-700'} intro-fade-up mb-5 text-xs font-bold uppercase tracking-[0.28em] sm:text-sm`}>cinema quiz</p>
            <h1 className={`${isNightTheme ? 'text-white' : 'text-slate-950'} intro-fade-up max-w-4xl text-5xl font-black leading-[0.98] tracking-tight sm:text-7xl lg:text-8xl`} style={{ animationDelay: '90ms' }}>
              Guess the movie
            </h1>
            <p className={`${isNightTheme ? 'text-white/72' : 'text-slate-700'} intro-fade-up mt-5 max-w-2xl text-base font-medium leading-7 sm:text-xl sm:leading-8`} style={{ animationDelay: '180ms' }}>
              Read the frame, spot the cast, and choose the title before the next hint gives it away.
            </p>

            <button
              onClick={handleStartGame}
              className="intro-button-motion mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-amber-300 px-8 py-3 text-base font-black text-gray-950 shadow-[0_22px_60px_rgba(251,191,36,0.28)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-200/40"
            >
              Start game
            </button>
          </section>

          <footer className={`${isNightTheme ? 'text-white/45' : 'text-slate-500'} intro-fade-up text-center text-xs font-medium sm:text-left`}>
            Stills, cast data, and trailers are powered by TMDB.
          </footer>
        </div>
      </main>
    );
  }

  return (
    <div className={`${isNightTheme ? 'bg-[radial-gradient(circle_at_top,rgba(37,41,72,0.85)_0%,rgba(10,12,22,0.98)_44%,rgba(3,5,12,1)_100%)] text-slate-100' : 'bg-gradient-to-r from-slate-50 via-slate-200 to-slate-50 text-slate-950'} min-h-screen flex flex-col justify-start items-center px-0 py-3 sm:justify-center sm:px-4 sm:py-8`}>
      <div className="relative mb-4 flex w-full max-w-4xl items-center justify-center px-4 sm:mb-8">
        <button
          onClick={handleHomeClick}
          className={`${isNightTheme ? 'text-white focus:ring-amber-200/20' : 'text-slate-950 focus:ring-slate-950/10'} flex items-center justify-center gap-3 text-center text-2xl font-extrabold tracking-tight transition-opacity hover:opacity-75 focus:outline-none focus:ring-4 sm:text-3xl`}
          aria-label="Go to home screen"
        >
          <span>Guess</span>
          <Image src="/logo.png" alt="Logo" width={52} height={52} className="h-11 w-11 sm:h-16 sm:w-16" />
          <span>Movie</span>
        </button>
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          {themeToggleButton}
        </div>
      </div>

      {error && <p className="text-red-500 text-2xl">{error}</p>}

      {countdown !== null && (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className={`${isNightTheme ? 'text-amber-200/70' : 'text-slate-500'} mb-4 text-sm font-semibold uppercase tracking-[0.2em]`}>Get ready</p>
          <div
            key={countdown}
            className="modal-panel-in flex h-32 w-32 items-center justify-center rounded-full bg-amber-300 text-6xl font-extrabold text-slate-950 shadow-[0_24px_80px_rgba(251,191,36,0.28)] sm:h-40 sm:w-40 sm:text-7xl"
          >
            {countdown}
          </div>
        </div>
      )}

      {loading && countdown === null && <p className={`${isNightTheme ? 'text-slate-200' : 'text-slate-700'} text-2xl font-semibold mt-4`}>Loading...</p>}

      {!loading && countdown === null && currentMovie && (
        <>
          {visibleBackdrop && (
            <div className="mb-4 w-full sm:mb-8 sm:max-w-4xl">
              <div
                className="group relative overflow-hidden shadow-[0_28px_90px_rgba(0,0,0,0.55)] cursor-pointer sm:mx-4 sm:rounded-lg"
              >
                <Image
                  src={visibleBackdrop}
                  alt={currentMovie.title}
                  className="object-cover w-full h-full cursor-pointer transition-transform duration-700 ease-out lg:group-hover:scale-110"
                  width={900}
                  height={500}
                />
              </div>
            </div>
          )}

          <div className="grid w-full grid-cols-2 gap-2 px-3 pb-3 sm:max-w-3xl sm:gap-8 sm:px-0 sm:pb-0 sm:mb-8">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleAnswerClick(option)}
                className={`${isNightTheme ? 'bg-slate-800 text-white shadow-black/60 hover:bg-slate-700 hover:shadow-amber-950/40' : 'bg-white text-slate-950 shadow-slate-300/70 hover:bg-slate-50'} min-h-11 w-full rounded-xl px-3 py-2 text-center text-sm font-bold leading-tight shadow-lg transition-all duration-300 hover:-translate-y-0.5 sm:rounded-3xl sm:px-6 sm:py-3 sm:text-lg sm:shadow-xl md:mx-4`}
              >
                {option.title}
              </button>
            ))}
          </div>

          {visibleActor && (
            <div className="mb-4 flex flex-col items-center px-4 text-center sm:mb-12">
              <div className="relative h-24 w-24 overflow-hidden rounded-full shadow-lg shadow-black/50 sm:h-36 sm:w-36">
                <Image
                  src={visibleActor.profile_path}
                  alt={visibleActor.name}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 96px, 144px"
                />
              </div>
              <p className={`${isNightTheme ? 'text-amber-200/60' : 'text-slate-500'} mt-3 text-xs font-semibold uppercase tracking-wide sm:text-sm`}>Cast hint</p>
              <p className={`${isNightTheme ? 'text-white' : 'text-slate-950'} mt-1 text-base font-bold sm:text-xl`}>{visibleActor.name}</p>
            </div>
          )}
        </>
      )}

      {pendingHintStep !== null && (
        <div className={`${isHintClosing ? 'modal-overlay-out' : 'modal-overlay-in'} fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4`}>
          <div className={`${isHintClosing ? 'modal-panel-out' : 'modal-panel-in'} w-full max-w-sm rounded-2xl bg-slate-950 px-6 py-6 text-center shadow-2xl shadow-black/60`}>
            <p className="mb-5 text-base leading-relaxed text-slate-100 sm:text-lg">Not quite. Try once more with a new hint.</p>
            <button
              onClick={handleHintModalClose}
              className="min-h-11 rounded-full bg-amber-300 px-6 py-2 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/30 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-amber-200/30"
            >
              Show new hint
            </button>
          </div>
        </div>
      )}

      {showModal && currentMovie && (
        <div className="modal-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6">
          <div ref={resultModalRef} className={`${isNightTheme ? 'bg-slate-950 text-slate-100 shadow-black/70' : 'bg-white text-slate-950 shadow-slate-950/20'} modal-panel-in flex max-h-[94vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl text-center shadow-2xl sm:max-w-2xl lg:max-w-4xl lg:flex-row lg:overflow-hidden lg:text-left`}>
            <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden lg:h-auto lg:w-[420px]">
              <Image
                src={`https://image.tmdb.org/t/p/w500${currentMovie.poster_path}`}
                alt={currentMovie.title}
                className="object-cover"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
              />
              <div className="absolute right-3 top-3 z-10 flex gap-2 sm:right-4 sm:top-4 lg:hidden">
                <button
                  onClick={handleModalClose}
                  aria-label="Next movie"
                  title="Next movie"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/85 text-white shadow-lg backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-white/30"
                >
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div ref={resultDetailsRef} className="relative flex flex-1 flex-col items-center justify-start px-5 py-5 sm:px-8 sm:py-8 lg:min-h-0 lg:items-start lg:justify-center lg:overflow-y-auto lg:px-10">
              <button
                onClick={handleModalClose}
                aria-label="Next movie"
                title="Next movie"
                className={`${isNightTheme ? 'bg-white/10 text-white hover:bg-white/15 focus:ring-white/20' : 'bg-slate-100 text-slate-950 hover:bg-slate-200 focus:ring-slate-950/10'} absolute right-4 top-4 hidden h-10 w-10 items-center justify-center rounded-full transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-4 lg:flex`}
              >
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <div className={`${isCorrectAnswer ? (isNightTheme ? 'bg-emerald-400/10 text-emerald-100' : 'bg-emerald-50 text-emerald-800') : (isNightTheme ? 'bg-rose-400/10 text-rose-100' : 'bg-rose-50 text-rose-800')} mb-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold sm:text-lg`}>
                <span className={`${isCorrectAnswer ? 'bg-emerald-600' : 'bg-rose-600'} flex h-7 w-7 items-center justify-center rounded-full text-white`}>
                  {isCorrectAnswer ? (
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  )}
                </span>
                <span>{isCorrectAnswer ? 'Correct' : 'Incorrect'}</span>
              </div>
              <div className="mb-4 flex items-center justify-center gap-3 lg:justify-start">
                <p className={`${isNightTheme ? 'text-white' : 'text-slate-950'} text-xl font-semibold sm:text-2xl`}>
                  {currentMovie.title}{releaseYear ? ` (${releaseYear})` : ''}
                </p>

                {trailerEmbedUrl && (
                  <button
                    onClick={() => setShowTrailerModal(true)}
                    aria-label="Open trailer"
                    title="Open trailer"
                    className={`${isNightTheme ? 'bg-white/10 text-white hover:bg-white/15 focus:ring-white/20' : 'bg-slate-100 text-slate-950 hover:bg-slate-200 focus:ring-slate-950/10'} flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-4`}
                  >
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.58 7.19a2.58 2.58 0 0 0-1.82-1.83C18.16 4.93 12 4.93 12 4.93s-6.16 0-7.76.43a2.58 2.58 0 0 0-1.82 1.83C2 8.8 2 12 2 12s0 3.2.42 4.81a2.58 2.58 0 0 0 1.82 1.83c1.6.43 7.76.43 7.76.43s6.16 0 7.76-.43a2.58 2.58 0 0 0 1.82-1.83C22 15.2 22 12 22 12s0-3.2-.42-4.81ZM10 15.07V8.93L15.2 12 10 15.07Z" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="mb-5 w-full max-w-xl space-y-2">
                {currentMovie.overview && (
                  <details onToggle={handleDescriptionToggle} className={`${isNightTheme ? 'bg-white/5' : 'bg-slate-50'} group rounded-xl px-4 py-3 text-left`}>
                    <summary className={`${isNightTheme ? 'text-white' : 'text-slate-950'} cursor-pointer list-none text-sm font-semibold sm:text-base`}>
                      <span className="inline-flex w-full items-center justify-between gap-4">
                        Description
                        <span className="text-lg leading-none transition-transform duration-200 group-open:rotate-45">+</span>
                      </span>
                    </summary>
                    <p className={`${isNightTheme ? 'text-slate-300' : 'text-slate-700'} mt-3 text-sm leading-relaxed sm:text-base`}>{currentMovie.overview}</p>
                  </details>
                )}

              </div>

              {rewardMessage && <div className={`${isNightTheme ? 'bg-amber-300/10 text-amber-100' : 'bg-amber-50 text-amber-900'} mb-5 rounded-lg p-4 text-lg`}>{rewardMessage}</div>}

            </div>
          </div>

          {showTrailerModal && trailerEmbedUrl && (
            <div className="modal-overlay-in fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-6">
              <div className="modal-panel-in w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-2xl">
                <div className="flex items-center justify-between bg-black px-4 py-3 text-white">
                  <p className="text-sm font-semibold sm:text-base">{currentMovie.title} trailer</p>
                  <button
                    onClick={() => setShowTrailerModal(false)}
                    aria-label="Close trailer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-4 focus:ring-white/20"
                  >
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
                <div className="aspect-video w-full">
                  <iframe
                    src={trailerEmbedUrl}
                    title={`${currentMovie.title} trailer`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
