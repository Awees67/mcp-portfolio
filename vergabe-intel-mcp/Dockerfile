# Dockerfile — das Rezept, um den Server in eine versiegelte "Kiste" (Image) zu packen.
# Die Kiste läuft danach auf JEDEM Server gleich (Laptop, Kunde, Cloud).

# 1) Fertige Basis-Kiste mit Node 22 (enthält die eingebaute SQLite-DB)
FROM node:22-slim

# 2) Arbeitsordner innerhalb der Kiste
WORKDIR /app

# 3) Erst die Paketliste rein, dann nur die Produktions-Bibliotheken installieren
#    (eigene Schicht -> Docker kann das zwischenspeichern, schnellere Re-Builds)
COPY package*.json ./
RUN npm install --omit=dev

# 4) Unseren Code rein (server.mjs, db.mjs, vergabe-intel-http.mjs, ingest.mjs, ...)
COPY . .

# 5) Die Kiste stellt Tür (Port) 3000 bereit
EXPOSE 3000

# 6) Beim Start der Kiste: die HTTP-Tür ausführen
CMD ["node", "--no-warnings", "vergabe-intel-http.mjs"]
