FROM nginx:1.27-alpine
COPY preview/ /usr/share/nginx/html/
EXPOSE 80
