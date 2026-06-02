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
const RECENT_MOVIES_LIMIT = 40;
const DISCOVER_PAGE_LIMIT = 25;
const DISCOVER_ATTEMPTS = 5;
const INTRO_IMAGES = [
  'https://image.tmdb.org/t/p/w780/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
  'https://image.tmdb.org/t/p/w780/hZkgoQYus5vegHoetLkCJzb17zJ.jpg',
  'https://image.tmdb.org/t/p/w780/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg',
  'https://image.tmdb.org/t/p/w780/8rpDcsfLJypbO6vREc0547VKqEv.jpg',
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

  if (!hasStarted) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-sky-400 text-white">
        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(17,16,15,0.96)_0%,rgba(33,28,24,0.88)_48%,rgba(92,25,20,0.76)_100%)]" />
        <div className="intro-film-strip absolute inset-x-0 top-0 h-20 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.14)_0_14px,transparent_14px_28px)] opacity-25" />
        <div className="intro-film-strip-reverse absolute inset-x-0 bottom-0 h-20 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.12)_0_14px,transparent_14px_28px)] opacity-20" />
        <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-between px-5 py-8 sm:px-8 sm:py-10">
          <header className="intro-fade-down flex items-center justify-center gap-3 sm:justify-start">
            <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">Guess</span>
            <Image src="/logo.png" alt="Logo" width={68} height={68} className="h-14 w-14 sm:h-16 sm:w-16" priority />
            <span className="text-2xl font-extrabold tracking-tight sm:text-3xl">Movie</span>
          </header>

          <section className="flex flex-1 flex-col items-center justify-center py-10 text-center sm:items-start sm:text-left">
            <p className="intro-fade-up mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-amber-200">movie quiz</p>
            <h1 className="intro-fade-up max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl" style={{ animationDelay: '90ms' }}>
              Guess the movie from stills and cast hints
            </h1>

            <div className="mt-8 grid w-full max-w-4xl grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4 sm:gap-4">
              {INTRO_IMAGES.map((src, index) => (
                <div
                  key={src}
                  className="intro-float-card intro-card-motion relative aspect-[4/3] overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.48)] [--intro-delay:220ms] sm:[--intro-rotate:-2deg]"
                  style={{
                    '--intro-delay': `${160 + index * 110}ms`,
                    '--intro-rotate': `${index % 2 === 0 ? -2 : 2}deg`,
                  } as React.CSSProperties}
                >
                  <Image
                    src={src}
                    alt=""
                    fill
                    priority={index === 0}
                    className="intro-image-zoom object-cover"
                    sizes="(max-width: 640px) 50vw, 240px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-white/10" />
                </div>
              ))}
            </div>

            <button
              onClick={handleStartGame}
              className="intro-button-motion mt-9 inline-flex min-h-12 items-center justify-center rounded-full bg-amber-300 px-8 py-3 text-base font-bold text-gray-950 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-200 focus:outline-none focus:ring-4 focus:ring-amber-200/40"
            >
              Start game
            </button>
          </section>

          <footer className="text-center text-xs text-white/45 sm:text-left">
            Stills, cast data, and trailers are powered by TMDB.
          </footer>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-start items-center bg-gradient-to-r from-gray-50 via-gray-200 to-gray-50 px-0 py-3 sm:justify-center sm:px-4 sm:py-8">
      <button
        onClick={handleHomeClick}
        className="mb-4 flex items-center justify-center gap-3 text-center text-2xl font-extrabold text-gray-900 tracking-tight transition-opacity hover:opacity-75 focus:outline-none focus:ring-4 focus:ring-black/10 sm:mb-8 sm:text-3xl"
        aria-label="Go to home screen"
      >
        <span>Guess</span>
        <Image src="/logo.png" alt="Logo" width={52} height={52} className="h-11 w-11 sm:h-16 sm:w-16" />
        <span>Movie</span>
      </button>

      {error && <p className="text-red-500 text-2xl">{error}</p>}

      {countdown !== null && (
        <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">Get ready</p>
          <div
            key={countdown}
            className="modal-panel-in flex h-32 w-32 items-center justify-center rounded-full bg-yellow-400 text-6xl font-extrabold text-black shadow-2xl sm:h-40 sm:w-40 sm:text-7xl"
          >
            {countdown}
          </div>
        </div>
      )}

      {loading && countdown === null && <p className="text-2xl font-semibold mt-4">Loading...</p>}

      {!loading && countdown === null && currentMovie && (
        <>
          {visibleBackdrop && (
            <div className="mb-4 w-full sm:mb-8 sm:max-w-4xl">
              <div
                className="group relative overflow-hidden shadow-lg cursor-pointer sm:mx-4 sm:rounded-lg"
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
                className="min-h-11 w-full rounded-xl bg-gradient-to-r from-gray-900 to-black px-3 py-2 text-center text-sm font-semibold leading-tight text-white shadow-lg transition-all duration-300 hover:bg-gray-800 sm:rounded-3xl sm:px-6 sm:py-3 sm:text-lg sm:shadow-xl md:mx-4"
              >
                {option.title}
              </button>
            ))}
          </div>

          {visibleActor && (
            <div className="mb-4 flex flex-col items-center px-4 text-center sm:mb-12">
              <div className="relative h-24 w-24 overflow-hidden rounded-full shadow-lg sm:h-36 sm:w-36">
                <Image
                  src={visibleActor.profile_path}
                  alt={visibleActor.name}
                  className="object-cover"
                  fill
                  sizes="(max-width: 640px) 96px, 144px"
                />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:text-sm">Cast hint</p>
              <p className="mt-1 text-base font-bold text-gray-900 sm:text-xl">{visibleActor.name}</p>
            </div>
          )}
        </>
      )}

      {pendingHintStep !== null && (
        <div className={`${isHintClosing ? 'modal-overlay-out' : 'modal-overlay-in'} fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4`}>
          <div className={`${isHintClosing ? 'modal-panel-out' : 'modal-panel-in'} w-full max-w-sm rounded-2xl bg-amber-100 px-6 py-6 text-center shadow-2xl`}>
            <p className="mb-5 text-base leading-relaxed text-black sm:text-lg">Not quite. Try once more with a new hint.</p>
            <button
              onClick={handleHintModalClose}
              className="min-h-11 rounded-full bg-gray-950 px-6 py-2 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:bg-black hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-black/10"
            >
              Show new hint
            </button>
          </div>
        </div>
      )}

      {showModal && currentMovie && (
        <div className="modal-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-6">
          <div ref={resultModalRef} className="modal-panel-in flex max-h-[94vh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-white text-center shadow-2xl sm:max-w-2xl lg:max-w-4xl lg:flex-row lg:overflow-hidden lg:text-left">
            <div className="relative aspect-[2/3] w-full shrink-0 overflow-hidden lg:h-auto lg:w-[420px]">
              <Image
                src={`https://image.tmdb.org/t/p/w500${currentMovie.poster_path}`}
                alt={currentMovie.title}
                className="object-cover"
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
              />
              <div className="absolute right-3 top-3 z-10 flex gap-2 sm:right-4 sm:top-4">
                <button
                  onClick={handleModalClose}
                  aria-label="Next movie"
                  title="Next movie"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-950 shadow-lg backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-white/40"
                >
                  <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div ref={resultDetailsRef} className="flex flex-1 flex-col items-center justify-start px-5 py-5 sm:px-8 sm:py-8 lg:min-h-0 lg:items-start lg:justify-center lg:overflow-y-auto lg:px-10">
              <div className={`${isCorrectAnswer ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'} mb-3 inline-flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold sm:text-lg`}>
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
                <p className="text-xl font-semibold text-gray-900 sm:text-2xl">
                  {currentMovie.title}{releaseYear ? ` (${releaseYear})` : ''}
                </p>

                {trailerEmbedUrl && (
                  <button
                    onClick={() => setShowTrailerModal(true)}
                    aria-label="Open trailer"
                    title="Open trailer"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-950 transition-all duration-300 hover:-translate-y-0.5 hover:bg-gray-200 focus:outline-none focus:ring-4 focus:ring-black/10"
                  >
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.58 7.19a2.58 2.58 0 0 0-1.82-1.83C18.16 4.93 12 4.93 12 4.93s-6.16 0-7.76.43a2.58 2.58 0 0 0-1.82 1.83C2 8.8 2 12 2 12s0 3.2.42 4.81a2.58 2.58 0 0 0 1.82 1.83c1.6.43 7.76.43 7.76.43s6.16 0 7.76-.43a2.58 2.58 0 0 0 1.82-1.83C22 15.2 22 12 22 12s0-3.2-.42-4.81ZM10 15.07V8.93L15.2 12 10 15.07Z" />
                    </svg>
                  </button>
                )}
              </div>

              <div className="mb-5 w-full max-w-xl space-y-2">
                {currentMovie.overview && (
                  <details onToggle={handleDescriptionToggle} className="group rounded-xl bg-gray-50 px-4 py-3 text-left">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-gray-950 sm:text-base">
                      <span className="inline-flex w-full items-center justify-between gap-4">
                        Description
                        <span className="text-lg leading-none transition-transform duration-200 group-open:rotate-45">+</span>
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-gray-700 sm:text-base">{currentMovie.overview}</p>
                  </details>
                )}

              </div>

              {rewardMessage && <div className="mb-5 rounded-lg bg-yellow-100 p-4 text-lg text-yellow-900">{rewardMessage}</div>}

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
