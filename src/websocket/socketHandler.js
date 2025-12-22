module.exports = (io, socket) => {
    // Handle client subscription to session events
    socket.on('subscribe:session', (sessionId) => {
        socket.join(`session:${sessionId}`);
    });

    // Handle client unsubscription
    socket.on('unsubscribe:session', (sessionId) => {
        socket.leave(`session:${sessionId}`);
    });

    socket.on('disconnect', () => {
        // Client disconnected
    });
};
