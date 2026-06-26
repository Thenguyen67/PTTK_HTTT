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
    const { id, total, time, isReturn, memberId, memberName, payment, items } = req.body;
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const itemsJson = typeof items === 'string' ? items : JSON.stringify(items || []);
        
        await connection.execute(
            'INSERT INTO orders (id, total, time, is_return, member_id, member_name, payment, items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [id, total, time, isReturn, memberId || null, memberName || 'Khách vãng lai', payment || 'CASH', itemsJson]
        );
        res.json({ success: true, message: 'Lưu hóa đơn thành công' });
    } catch (error) {
        console.error('Lỗi khi lưu hóa đơn:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lưu hóa đơn' });
    } finally {
        if (connection) await connection.end();
    }
});

app.get('/api/orders/history', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
            'SELECT * FROM orders WHERE created_at >= NOW() - INTERVAL 7 DAY ORDER BY created_at ASC'
        );
        
        const formattedOrders = rows.map(row => ({
            id: row.id,
            total: Number(row.total),
            time: row.time,
            isReturn: Boolean(row.is_return),
            memberId: row.member_id,
            memberName: row.member_name || 'Khách vãng lai',
            payment: row.payment || 'CASH',
            items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || [])
        }));

        res.json({ success: true, data: formattedOrders });
    } catch (error) {
        console.error('Lỗi khi lấy lịch sử 7 ngày:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải lịch sử' });
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

app.get('/api/members', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT * FROM members ORDER BY created_at DESC');
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách thành viên:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ' });
    } finally {
        if (connection) await connection.end();
    }
});

app.post('/api/members/create', async (req, res) => {
    const { id, name, phone, rank_name, discount_rate, points } = req.body;
    if (!id || !name) {
        return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (id, name).' });
    }
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        // Kiểm tra trùng
        const [existing] = await connection.execute('SELECT id FROM members WHERE id = ?', [id]);
        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: `Thẻ thành viên với SDT "${id}" đã tồn tại.` });
        }
        await connection.execute(
            'INSERT INTO members (id, name, phone, rank_name, discount_rate, points, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [id, name, phone || id, rank_name || 'Thành viên', discount_rate || 0, points || 0]
        );
        res.json({ success: true, message: 'Tạo thẻ thành viên thành công.' });
    } catch (error) {
        console.error('Lỗi khi tạo thành viên:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo thành viên.' });
    } finally {
        if (connection) await connection.end();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[SERVER] Máy chủ eMarket đang chạy tại: http://localhost:${PORT}`);
});