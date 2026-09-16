"""Initial immutable PostGIS schema."""
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.execute('CREATE EXTENSION IF NOT EXISTS postgis')
    op.execute('\nCREATE TABLE events (\n\tid UUID NOT NULL, \n\tevent_type VARCHAR(40) NOT NULL, \n\tstatus VARCHAR(30) NOT NULL, \n\tseverity VARCHAR(20) NOT NULL, \n\tconfidence FLOAT NOT NULL, \n\tobservation_count INTEGER NOT NULL, \n\tlocation geography(POINT,4326) NOT NULL, \n\tlatitude FLOAT NOT NULL, \n\tlongitude FLOAT NOT NULL, \n\tfirst_seen TIMESTAMP WITH TIME ZONE NOT NULL, \n\tlast_seen TIMESTAMP WITH TIME ZONE NOT NULL, \n\tcreated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tupdated_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tresolved_at TIMESTAMP WITH TIME ZONE, \n\tassigned_department VARCHAR(100), \n\tPRIMARY KEY (id), \n\tCHECK (confidence >= 0 AND confidence <= 1)\n)\n\n')
    op.execute('CREATE INDEX ix_events_event_type ON events (event_type)')
    op.execute('CREATE INDEX ix_events_status ON events (status)')
    op.execute('CREATE INDEX idx_events_location ON events USING gist (location)')
    op.execute('CREATE INDEX ix_events_last_seen ON events (last_seen)')
    op.execute('\nCREATE TABLE users (\n\tid UUID NOT NULL, \n\temail VARCHAR(254) NOT NULL, \n\tpassword_hash VARCHAR(255) NOT NULL, \n\trole VARCHAR(40) NOT NULL, \n\tis_active BOOLEAN NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (email)\n)\n\n')
    op.execute('\nCREATE TABLE vehicles (\n\tid UUID NOT NULL, \n\texternal_vehicle_id VARCHAR(100) NOT NULL, \n\tvehicle_type VARCHAR(50) NOT NULL, \n\troute_id VARCHAR(100), \n\tis_active BOOLEAN NOT NULL, \n\tlatitude FLOAT, \n\tlongitude FLOAT, \n\tlast_seen TIMESTAMP WITH TIME ZONE, \n\tPRIMARY KEY (id), \n\tUNIQUE (external_vehicle_id)\n)\n\n')
    op.execute('\nCREATE TABLE audit_logs (\n\tid UUID NOT NULL, \n\tuser_id UUID NOT NULL, \n\tresource_id UUID NOT NULL, \n\taction VARCHAR(100) NOT NULL, \n\tdetails JSON NOT NULL, \n\ttimestamp TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tFOREIGN KEY(user_id) REFERENCES users (id)\n)\n\n')
    op.execute('\nCREATE TABLE event_observations (\n\tid UUID NOT NULL, \n\tevent_id UUID NOT NULL, \n\tvehicle_id UUID NOT NULL, \n\tpayload_hash VARCHAR(64) NOT NULL, \n\tcamera_id VARCHAR(100), \n\tmodel_confidence FLOAT NOT NULL, \n\tlatitude FLOAT NOT NULL, \n\tlongitude FLOAT NOT NULL, \n\tcaptured_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tframe_number INTEGER, \n\tPRIMARY KEY (id), \n\tCHECK (model_confidence >= 0 AND model_confidence <= 1), \n\tFOREIGN KEY(event_id) REFERENCES events (id), \n\tFOREIGN KEY(vehicle_id) REFERENCES vehicles (id)\n)\n\n')
    op.execute('CREATE INDEX ix_event_observations_vehicle_id ON event_observations (vehicle_id)')
    op.execute('CREATE INDEX ix_event_observations_captured_at ON event_observations (captured_at)')
    op.execute('CREATE INDEX ix_event_observations_event_id ON event_observations (event_id)')
    op.execute('\nCREATE TABLE evidence (\n\tid UUID NOT NULL, \n\tobservation_id UUID NOT NULL, \n\tevent_id UUID NOT NULL, \n\tfile_url VARCHAR(2048) NOT NULL, \n\tcaptured_at TIMESTAMP WITH TIME ZONE NOT NULL, \n\tPRIMARY KEY (id), \n\tUNIQUE (observation_id), \n\tFOREIGN KEY(observation_id) REFERENCES event_observations (id), \n\tFOREIGN KEY(event_id) REFERENCES events (id)\n)\n\n')
    op.execute('CREATE INDEX ix_evidence_event_id ON evidence (event_id)')


def downgrade():
    op.drop_table('evidence')
    op.drop_table('event_observations')
    op.drop_table('audit_logs')
    op.drop_table('vehicles')
    op.drop_table('users')
    op.drop_table('events')
