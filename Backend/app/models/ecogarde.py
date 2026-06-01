from sqlalchemy import Boolean, Column, Date, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class Ecogarde(Base):
    __tablename__ = "ecogardes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nom = Column(String(255), nullable=False)
    prenom = Column(String(255), nullable=False)
    # Identifiant utilisé dans les soumissions Kobo (_submitted_by ou champ métier)
    code_kobo = Column(String(255), unique=True, nullable=False, index=True)
    foret = Column(String(100), nullable=True)       # "Zaranou", "Apouéba", ou null
    telephone = Column(String(50), nullable=True)
    date_recrutement = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
