CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT 'Portland',
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  service TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  source TEXT DEFAULT 'public_submission',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews (created_at);

INSERT OR IGNORE INTO reviews (id, customer_name, email, city, rating, review_text, service, status, source, created_at, updated_at) VALUES
('starter-review-001', 'Portland homeowner sample 1', 'sample1@goperigee.com', 'Portland', 5, 'Reliable mowing and edging with clear communication. This is the kind of recurring property care busy Portland homeowners look for.', 'Mowing and edging', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-002', 'Portland homeowner sample 2', 'sample2@goperigee.com', 'Portland', 5, 'The membership makes scheduling exterior care much easier. The included inspections and quotes are especially useful.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-003', 'Portland homeowner sample 3', 'sample3@goperigee.com', 'Portland', 5, 'Good fit for keeping a property looking consistent without having to remember every seasonal service.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-004', 'Portland homeowner sample 4', 'sample4@goperigee.com', 'Portland', 5, 'The combination of mowing, gutter cleaning, and fertilizer scheduling is simple and practical.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-005', 'Portland homeowner sample 5', 'sample5@goperigee.com', 'Portland', 5, 'Priority scheduling is a strong benefit, especially when the weather shifts and work needs to be handled quickly.', 'Priority scheduling', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-006', 'Portland homeowner sample 6', 'sample6@goperigee.com', 'Portland', 5, 'Professional, organized, and easy to request service through the portal. The property care package is straightforward.', 'Customer portal', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-007', 'Portland homeowner sample 7', 'sample7@goperigee.com', 'Portland', 5, 'The free inspections and quotes help identify what needs attention before small issues become bigger projects.', 'Inspections and quotes', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-008', 'Portland homeowner sample 8', 'sample8@goperigee.com', 'Portland', 5, 'Great concept for Portland properties that need consistent upkeep throughout the year.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-009', 'Portland homeowner sample 9', 'sample9@goperigee.com', 'Portland', 5, 'Having discounted add-on options for window cleaning, roof cleaning, and other exterior services is a helpful bonus.', 'Discounted add-ons', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-010', 'Portland homeowner sample 10', 'sample10@goperigee.com', 'Portland', 5, 'The service request process is clear and simple. It is easy to see what is included in the monthly membership.', 'Service request', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-011', 'Portland homeowner sample 11', 'sample11@goperigee.com', 'Portland', 5, 'This kind of plan works well for people who want predictable exterior maintenance in Portland.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-012', 'Portland homeowner sample 12', 'sample12@goperigee.com', 'Portland', 5, 'The membership is organized around the services homeowners actually need on a recurring basis.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now')),
('starter-review-013', 'Portland homeowner sample 13', 'sample13@goperigee.com', 'Portland', 4, 'Strong service package and a helpful portal. The clear list of included services makes the plan easy to understand.', 'Perigee Membership', 'pending', 'starter_sample', datetime('now'), datetime('now'));
