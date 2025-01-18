# Use the official Node.js image from Docker Hub
FROM node:14

# Create and set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Run setupDatabase.js during the build process
RUN node setupDatabase.js

# Expose the port your app will run on (if applicable)
EXPOSE 3000

# Command to run your application
CMD ["node", "server.js"]