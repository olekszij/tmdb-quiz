// Импортируем dotenv для загрузки переменных окружения
import dotenv from 'dotenv';

// Загружаем переменные из файла .env
dotenv.config();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    API_KEY: process.env.API_KEY,  // Подключаем переменную API_KEY из .env
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },
};

export default nextConfig;
