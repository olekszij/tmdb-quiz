'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Image from 'next/image';

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_paths: string[];
}

interface MovieResponse {
  results: {
    id: number;
    title: string;
    poster_path: string;
  }[];
}

const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

const fetchRandomMovie = async (): Promise<Movie | null> => {
  const randomYear = Math.floor(Math.random() * (2024 - 1980 + 1)) + 1980; // Случайный год в диапазоне 1980-2024

  try {
    const response = await axios.get<MovieResponse>(
      `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=en-US&sort_by=popularity.desc&year=${randomYear}`
    );

    const movies = response.data.results;
    if (movies.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * movies.length);
    const selectedMovie = movies[randomIndex];

    const backdrops = await fetchMovieImages(selectedMovie.id);

    return {
      id: selectedMovie.id,
      title: selectedMovie.title,
      poster_path: selectedMovie.poster_path,
      backdrop_paths: backdrops,
    };
  } catch (error) {
    console.error('Error fetching movie:', error);
    return null;
  }
};

const fetchMovieImages = async (movieId: number): Promise<string[]> => {
  try {
    const response = await axios.get<{ backdrops: { iso_639_1: string | null; file_path: string }[] }>(
      `https://api.themoviedb.org/3/movie/${movieId}/images?api_key=${API_KEY}`
    );

    const backdrops = response.data.backdrops
      .filter((backdrop) => backdrop.iso_639_1 === null)
      .slice(0, 3)
      .map((backdrop) => `https://image.tmdb.org/t/p/w780${backdrop.file_path}`);

    return backdrops;
  } catch (error) {
    console.error('Error fetching movie images:', error);
    return [];
  }
};

export default function Quiz() {
  const [currentMovie, setCurrentMovie] = useState<Movie | null>(null);
  const [options, setOptions] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [streak, setStreak] = useState<number>(0);

  const generateQuestion = useCallback(async () => {
    setLoading(true);

    const movie = await fetchRandomMovie();
    if (!movie) {
      setError('No movie found for the selected year.');
      setLoading(false);
      return;
    }

    const randomOptions: Movie[] = [movie];
    while (randomOptions.length < 4) {
      const randomOption = await fetchRandomMovie();
      if (randomOption && !randomOptions.find((opt) => opt.id === randomOption.id)) {
        randomOptions.push(randomOption);
      }
    }

    setCurrentMovie(movie);
    setOptions(shuffleArray(randomOptions));
    setLoading(false);
    setMessage('');
    setRewardMessage(null);
    setShowModal(false);
  }, []);

  useEffect(() => {
    generateQuestion();
  }, [generateQuestion]);

  const shuffleArray = (array: Movie[]): Movie[] => {
    return array.sort(() => Math.random() - 0.5);
  };

  const handleAnswerClick = (selectedMovie: Movie) => {
    if (selectedMovie.id === currentMovie?.id) {
      setMessage('Correct! 🎉');
      setScore((prevScore) => prevScore + 1);
      setStreak((prevStreak) => prevStreak + 1);

      if (streak + 1 === 5) {
        setRewardMessage("You've earned the 'Silver Cinematographer' badge for 5 correct answers in a row!");
      } else if (streak + 1 === 10) {
        setRewardMessage("You've earned the 'Gold Director' badge for 10 correct answers in a row!");
      }

      setShowModal(true);
    } else {
      setMessage(`Incorrect! The movie was: ${currentMovie?.title}`);
      setScore((prevScore) => prevScore - 3);
      setStreak(0);
      setShowModal(true);
    }
  };

  const handleModalClose = () => {
    setShowModal(false);
    generateQuestion();
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-r from-gray-50 via-gray-200 to-gray-50">
      <Image src="/logo.png" alt="Logo" width={64} height={64} className="mb-4" />
      <h1 className="text-3xl font-extrabold mb-8 text-gray-900 text-center tracking-tight">Guess the Movie</h1>

      {error && <p className="text-red-500 text-2xl">{error}</p>}

      {loading && <p className="text-2xl font-semibold mt-4">Loading...</p>}

      {!loading && currentMovie && (
        <>
          <div className="flex flex-col gap-6 max-w-4xl mx-auto mb-12">
            {currentMovie.backdrop_paths.map((path, index) => (
              <div
                key={index}
                className="relative overflow-hidden rounded-lg shadow-lg transform md:hover:scale-150  hover:z-10 transition-transform duration-300 cursor-pointer mx-4"
              >
                <Image
                  src={path}
                  alt={currentMovie.title}
                  className="object-cover w-full h-full cursor-pointer"
                  width={900}
                  height={500}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-3xl mx-auto mb-12">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleAnswerClick(option)}
                className="bg-gradient-to-r from-gray-900 to-black text-white py-3 px-6 w-full text-center rounded-3xl hover:bg-gray-800 transition-all duration-300 text-lg shadow-xl md:mx-4"
              >
                {option.title}
              </button>
            ))}
          </div>
        </>
      )}

      {showModal && currentMovie && (
        <div className="fixed inset-0 flex justify-center items-center bg-black bg-opacity-60 transition-opacity duration-300">
          <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
            <h2 className="text-3xl font-bold mb-4">{message}</h2>
            <Image src={`https://image.tmdb.org/t/p/w500${currentMovie.poster_path}`} alt={currentMovie.title} width={300} height={450} className="mx-auto mb-4" />

            {rewardMessage && <div className="bg-yellow-100 p-4 mb-4 rounded-lg text-yellow-900 text-lg">{rewardMessage}</div>}

            <button onClick={handleModalClose} className={`${message.includes('Correct') ? 'bg-green-500' : 'bg-red-500'} text-white py-2 px-6 rounded-full hover:opacity-90 transition-opacity duration-300`}>
              {message.includes('Correct') ? 'Great!' : 'Try Again'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
