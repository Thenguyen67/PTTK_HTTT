require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors()); 
app.use(express.json());

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/products/:id', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
        
        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
        }
    } catch (error) {
        console.error('Lỗi khi lấy thông tin sản phẩm:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/products/increase-stock', async (req, res) => {
    const { productId, quantity } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE products SET stock = stock + ? WHERE id = ?',
            [quantity, productId]
        );
        res.json({ success: true, message: 'Cập nhật kho thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật kho' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/members/revoke-points', async (req, res) => {
    const { memberId, points } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE members SET points = GREATEST(0, points - ?) WHERE id = ?',
            [points, memberId]
        );
        res.json({ success: true, message: 'Thu hồi điểm thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi trừ điểm' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/orders', async (req, res) => {
    const { id, total, time, isReturn, memberId } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO orders (id, total, time, is_return, member_id) VALUES (?, ?, ?, ?, ?)',
            [id, total, time, isReturn, memberId || null]
        );
        res.json({ success: true, message: 'Lưu hóa đơn thành công' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi server khi lưu hóa đơn' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/products/decrease-stock', async (req, res) => {
    const { items } = req.body; 
    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        for (let item of items) {
            await connection.execute(
                'UPDATE products SET stock = stock - ? WHERE id = ?',
                [item.quantity, item.productId]
            );
        }
        res.json({ success: true, message: 'Trừ kho thành công' });
    } catch (error) {
        console.error('Lỗi khi trừ kho:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật tồn kho' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/members/update-points', async (req, res) => {
    const { memberCode, pointsUsed, pointsEarned } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE members SET points = points - ? + ? WHERE id = ?',
            [pointsUsed || 0, pointsEarned || 0, memberCode]
        );
        const [rows] = await connection.execute(
            'SELECT points FROM members WHERE id = ?', 
            [memberCode]
        );
        res.json({ success: true, newTotalPoints: rows[0].points });
    } catch (error) {
        console.error('Lỗi khi cập nhật điểm:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tính điểm' });
    } finally {
        if (connection) await connection.end();
    }
});

app.get('/api/members/:id', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM members WHERE id = ?', [req.params.id]);
        
        if (rows.length > 0) {
            res.json({ success: true, data: rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'Không tìm thấy thẻ thành viên' });
        }
    } catch (error) {
        console.error('Lỗi khi lấy thông tin thành viên:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
    } finally {
        if (connection) await connection.end();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ eMarket đang chạy tại: http://localhost:${PORT}`);
});