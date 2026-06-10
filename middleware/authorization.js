import jwt from 'jsonwebtoken';

export const verifyToken = async (req, res, next) => {
    let token = null;
    
    if (req.headers.authorization) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token || token === 'undefined' || token === 'null') {
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dummy_secret');
        req.user = decoded;
        next();
    } catch (error) {
        console.error(`[AUTH ERROR] JWT Verification Failed in Payment Service: ${error.message}`);
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
