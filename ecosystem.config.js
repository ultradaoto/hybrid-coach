module.exports = {
  apps: [
    {
      name: 'hybridcoach',
      script: 'src/app.js',
      instances: 1, // set to "max" for clustering later
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
    },
  ],
}; 