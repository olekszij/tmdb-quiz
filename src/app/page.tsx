'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Image from 'next/image';

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_paths: string[]; // Array for multiple screenshots
}

interface MovieResponse {
  results: {
    id: number;
    title: string;
    poster_path: string;
  }[];
}

const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

// Function to fetch movies starting from 1980
const fetchMovies = async (): Promise<Movie[]> => {
  const years = Array.from({ length: 2023 - 1980 + 1 }, (_, i) => 1980 + i); // Array of years from 1980 to 2023
  let allMovies: Movie[] = [];

  // Fetch movies for each year
  for (const year of years) {
    const response = await axios.get<MovieResponse>(
      `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&language=en-US&sort_by=popularity.desc&year=${year}`
    );

    const movies = await Promise.all(
      response.data.results.map(async (movie) => {
        const backdrops = await fetchMovieImages(movie.id); // Fetch screenshots for each movie
        return {
          id: movie.id,
          title: movie.title,
          poster_path: movie.poster_path, // Adding poster
          backdrop_paths: backdrops,
        };
      })
    );

    allMovies = [...allMovies, ...movies];
  }

  return allMovies;
};

// Function to fetch images (screenshots) of a movie
const fetchMovieImages = async (movieId: number): Promise<string[]> => {
  try {
    const response = await axios.get<{ backdrops: { iso_639_1: string | null; file_path: string }[] }>(
      `https://api.themoviedb.org/3/movie/${movieId}/images?api_key=${API_KEY}`
    );

    // Filter screenshots where iso_639_1 === null (no language field)
    const backdrops = response.data.backdrops
      .filter((backdrop) => backdrop.iso_639_1 === null)
      .slice(0, 3) // Limit to 3 images
      .map((backdrop) => `https://image.tmdb.org/t/p/w780${backdrop.file_path}`);

    return backdrops;
  } catch (error) {
    console.error('Error fetching movie images:', error);
    return [];
  }
};

export default function Quiz() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [currentMovie, setCurrentMovie] = useState<Movie | null>(null);
  const [options, setOptions] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(false); // Loading state
  const [message, setMessage] = useState<string>(''); // Correct/incorrect message
  const [showModal, setShowModal] = useState<boolean>(false); // Show modal
  const [error, setError] = useState<string | null>(null); // Error handling

  // Using useCallback to prevent unnecessary re-renders
  const generateQuestion = useCallback((movieData: Movie[]) => {
    const availableMovies = movieData.filter((m) => m.backdrop_paths.length > 0);

    if (availableMovies.length < 4) {
      setError('Not enough movies available for the game.');
      return;
    }

    const randomMovie = availableMovies[Math.floor(Math.random() * availableMovies.length)];

    setCurrentMovie(randomMovie);
    setMovies((prevMovies) => prevMovies.filter((movie) => movie.id !== randomMovie.id)); // Remove current movie from list

    const randomOptions: Movie[] = [randomMovie];
    while (randomOptions.length < 4) {
      const randomOption = availableMovies[Math.floor(Math.random() * availableMovies.length)];
      if (!randomOptions.includes(randomOption)) randomOptions.push(randomOption);
    }

    setOptions(shuffleArray(randomOptions));
    setMessage(''); // Reset message on new question
    setShowModal(false); // Close modal
  }, []);

  useEffect(() => {
    const loadMovies = async () => {
      try {
        setLoading(true); // Show loading on first load
        const movieData = await fetchMovies();
        setMovies(movieData);
        generateQuestion(movieData);
        setLoading(false); // Hide loading
      } catch (error) {
        setError('Error loading movies.');
        setLoading(false);
      }
    };
    loadMovies();
  }, [generateQuestion]);

  const shuffleArray = (array: Movie[]): Movie[] => {
    return array.sort(() => Math.random() - 0.5);
  };

  const handleAnswerClick = (selectedMovie: Movie) => {
    if (selectedMovie.id === currentMovie?.id) {
      setMessage('Correct! 🎉');
      setShowModal(true);

      if (movies.length > 0) {
        setTimeout(() => {
          generateQuestion(movies); // Move to next question after 2 seconds
        }, 2000);
      } else {
        setError('Not enough movies for further questions.');
      }
    } else {
      setMessage(`Incorrect! The movie was: ${currentMovie?.title}`);
      setShowModal(true);
      setTimeout(() => {
        generateQuestion(movies); // Move to next question after 2 seconds
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-r from-gray-50 via-gray-200 to-gray-50">
      <Image
        src="/logo.png"
        alt="Logo"
        width={64}
        height={64}
        className="mb-4"
      />
      <h1 className="text-3xl font-extrabold mb-8 text-gray-900 text-center tracking-tight">
        Guess the Movie
      </h1>

      {/* Error loading */}
      {error && <p className="text-red-500 text-2xl">{error}</p>}

      {/* Loading status */}
      {loading && <p className="text-2xl font-semibold mt-4">Loading...</p>}

      {/* Game */}
      {!loading && currentMovie && (
        <>
          <div className="flex flex-col gap-6 max-w-4xl mx-auto mb-12">
            {currentMovie.backdrop_paths.map((path, index) => (
              <div
                key={index}
                className="overflow-hidden rounded-lg shadow-lg transform transition-transform hover:scale-105 duration-500 ease-in-out m-2"
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
                className="bg-gradient-to-r from-gray-900 to-black text-white py-3 px-6 w-full text-center rounded-3xl hover:bg-gray-800 transition-all duration-300 text-lg shadow-xl"
              >
                {option.title}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && currentMovie && (
        <div className="fixed inset-0 flex justify-center items-center bg-black bg-opacity-60 transition-opacity duration-300">
          <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md">
            <h2 className="text-3xl font-bold mb-4">{message}</h2>
            <Image
              src={`https://image.tmdb.org/t/p/w500${currentMovie.poster_path}`} // Movie poster
              alt={currentMovie.title}
              width={300}
              height={450}
              className="mx-auto mb-4"
            />
            <button
              onClick={() => setShowModal(false)}
              className={`${message.includes('Correct')
                ? 'bg-green-500'
                : 'bg-red-500'
                } text-white py-2 px-6 rounded-full hover:opacity-90 transition-opacity duration-300`}
            >
              {message.includes('Correct') ? 'Great!' : 'Try Again'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
