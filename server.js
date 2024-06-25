const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the "public" directory
app.use(express.static('public'));

// List of auctions and cars
const auctions = [
    {
        optionId: 1,
        cars: [
            { id: 1, name: 'Car 1', bids: [], sold: false },
            // { id: 2, name: 'Car 2', bids: [], sold: false },
        ]
    },
    {
        optionId: 2,
        cars: [
            // { id: 3, name: 'Car 3', bids: [], sold: false },
            // { id: 4, name: 'Car 4', bids: [], sold: false },
        ]
    },
];

let currentAuctionIndex = 0;
let currentCarIndex = 0;
const auctionTime = 30; // seconds

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'bid') {
            handleBid(data);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

function handleBid(data) {
    const currentAuction = auctions[currentAuctionIndex];
    const currentCar = currentAuction.cars[currentCarIndex];
    currentCar.bids.push({ userId: data.userId, amount: data.amount });
    broadcast({ type: 'new_bid', carId: currentCar.id, bids: currentCar.bids });
}

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function startAuction() {
    if (currentAuctionIndex >= auctions.length) {
        console.log('All auctions completed');
        saveAuctionResults();
        return;
    }

    const currentAuction = auctions[currentAuctionIndex];
    if (currentCarIndex >= currentAuction.cars.length) {
        currentCarIndex = 0;
        currentAuctionIndex++;
        startAuction();
        return;
    }

    const currentCar = currentAuction.cars[currentCarIndex];
    broadcast({ type: 'new_auction', car: currentCar, time: auctionTime });

    let remainingTime = auctionTime;

    const interval = setInterval(() => {
        remainingTime -= 1;
        broadcast({ type: 'timer_update', time: remainingTime });

        if (remainingTime <= 0) {
            clearInterval(interval);
            currentCar.sold = currentCar.bids.length > 0;
            broadcast({ type: 'auction_end', carId: currentCar.id, sold: currentCar.sold });
            currentCarIndex++;
            startAuction();
        }
    }, 1000);
}

function saveAuctionResults() {
    const results = auctions.map(auction => {
        return {
            optionId: auction.optionId,
            cars: auction.cars.map(car => ({
                id: car.id,
                name: car.name,
                bids: car.bids,
                sold: car.sold
            }))
        };
    });

    fs.writeFile('auction_results.json', JSON.stringify(results, null, 2), (err) => {
        if (err) throw err;
        console.log('Auction results saved to auction_results.json');
    });
}

server.listen(8080, () => {
    console.log('Server is listening on port 8080');
    startAuction();
});
