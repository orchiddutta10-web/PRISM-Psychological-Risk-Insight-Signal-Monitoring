import bcrypt
hash_val = b'$2b$12$avwbMNOEdlcTMTq.N6k3hOnJRkp2dMGbZbqJXMVoxXBqUjqL30gY.'
print("password:", bcrypt.checkpw(b'password', hash_val))
print("PrismDemo2024!:", bcrypt.checkpw(b'PrismDemo2024!', hash_val))
